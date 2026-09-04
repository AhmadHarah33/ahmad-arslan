"use client";

import { useState } from "react";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
import type {
  City,
  Company,
  Customer,
  MachineModel,
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
import { useT } from "@/lib/i18n/provider";
import { statusKey, priorityKey } from "@/lib/i18n/task-keys";
import DescriptionField from "./description-field";
import CustomFields from "@/components/fields/CustomFields";
import TaskParts from "./task-parts";
import ComboSelect from "@/components/combo-select";
import { createCity, createModel } from "@/app/(app)/catalog/actions";
import { createClient } from "@/lib/supabase/client";
import type { AssigneeLite, TaskTemplate } from "@/lib/types";
import { useEffect } from "react";
import { toastErr } from "@/lib/toast";

export default function TaskModal({
  profile,
  engineers,
  customers,
  companies,
  cities,
  models,
  task,
  initialStatus = "todo",
  onClose,
  onSaved,
  onCreated,
  onDeleted,
}: {
  profile: Profile;
  engineers: Profile[];
  customers: Pick<Customer, "id" | "name">[];
  companies: Company[];
  cities: City[];
  models: MachineModel[];
  task: Task | null;
  // Column a new task starts in (set when created from a column's menu).
  initialStatus?: TaskStatus;
  onClose: () => void;
  onSaved: (t: Task) => void;
  // Called after a *create* instead of onSaved, so the board picks the new
  // task up while this modal stays open.
  onCreated?: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  // A brand new task has no id, so comments, custom-field values and
  // parts-used have nothing to attach to. Rather than hide those sections
  // behind a second trip through the board, creating a task keeps this modal
  // open and swaps it into edit mode for the row we just made.
  const [createdTask, setCreatedTask] = useState<Task | null>(null);
  const current = task ?? createdTask;
  const isNew = !current;
  const editable = isNew || canEditTask(profile, current!);

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
  const [cityId, setCityId] = useState<string>(task?.city_id ?? "");
  const [companyId, setCompanyId] = useState<string>(task?.company_id ?? "");
  const [modelId, setModelId] = useState<string>(task?.model_id ?? "");
  const [partsCost, setPartsCost] = useState<string>(
    task?.parts_cost != null ? String(task.parts_cost) : ""
  );
  const [serviceCharge, setServiceCharge] = useState<string>(
    task?.service_charge != null ? String(task.service_charge) : ""
  );

  // Models belong to a brand, so the list narrows to the brand on this task.
  const brandModels = models.filter((m) => m.company_id === companyId);
  function pickBrand(id: string) {
    setCompanyId(id);
    if (modelId && !models.some((m) => m.id === modelId && m.company_id === id)) {
      setModelId("");
    }
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  // Drives the "will be sent for approval" notice below; kept in sync by
  // TaskParts rather than re-querying task_parts here too.
  const [hasParts, setHasParts] = useState(false);
  // Templates load after mount. Render the field from the start (disabled
  // while loading) rather than mounting it on arrival, which pushed Title and
  // everything under it down a row a moment after the modal opened.
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    if (!isNew) return;
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("task_templates").select("*").order("name");
      if (!active) return;
      setTemplates((data ?? []) as TaskTemplate[]);
      setTemplatesLoading(false);
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
      setError(t("task.titleRequired"));
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
      city_id: cityId || null,
      company_id: companyId || null,
      model_id: modelId || null,
      parts_cost: partsCost.trim() ? Number(partsCost) : null,
      service_charge: serviceCharge.trim() ? Number(serviceCharge) : null,
    };
    const res = isNew
      ? await createTask({ ...base, assignee_ids: assignees.map((a) => a.id) })
      : await updateTask(current!.id, base);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (!res?.task) return;
    const saved = res.task as Task;
    if (isNew) {
      // Keep the dialog up so Properties / Parts used / Activity become
      // available immediately for the task that was just created.
      setCreatedTask(saved);
      onCreated ? onCreated(saved) : onSaved(saved);
      return;
    }
    onSaved(saved);
  }

  async function remove() {
    if (!current) return;
    if (!confirm(t("task.confirmDelete"))) return;
    setSaving(true);
    const res = await deleteTask(current.id);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onDeleted(current.id);
  }

  const footer = editable ? (
    <div className="flex items-center justify-between gap-2">
      {!isNew ? (
        <button className="btn-danger" onClick={remove} disabled={saving}>
          {t("common.delete")}
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={saving}>
          {createdTask ? t("task.done") : t("common.cancel")}
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  ) : (
    <p className="text-center text-xs text-ink-faint">
      {t("task.onlyOwn")}
    </p>
  );

  return (
    <Modal
      title={isNew ? t("task.new") : editable ? t("task.edit") : t("task.one")}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        {isNew && (templatesLoading || templates.length > 0) && (
          <div>
            <label className="label">{t("task.template")}</label>
            <select
              className="input"
              defaultValue=""
              disabled={templatesLoading}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">
                {templatesLoading ? t("common.loading") : t("task.blank")}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">{t("task.title")}</label>
          <input
            className="input"
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("task.titlePlaceholder")}
          />
        </div>

        <DescriptionField
          value={description}
          onChange={setDescription}
          disabled={!editable}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("task.status")}</label>
            <select
              className="input"
              value={status}
              disabled={!editable}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.filter(
                (s) => s.key !== "pending_approval" || status === "pending_approval"
              ).map((s) => (
                <option key={s.key} value={s.key}>
                  {t(statusKey(s.key))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("task.priority")}</label>
            <select
              className="input capitalize"
              value={priority}
              disabled={!editable}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(priorityKey(p))}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">{t("task.dueDate")}</label>
          <input
            type="date"
            className="input"
            value={dueDate}
            disabled={!editable}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div>
          <label className="label">{t("task.assignees")}</label>
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
          <label className="label">{t("task.customer")}</label>
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
        {isNew && (
          <p className="rounded-lg border border-dashed border-surface-border px-3 py-2.5 text-xs text-ink-faint">
            {t("task.saveFirst")}
          </p>
        )}

        {createdTask && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {t("task.created")}
          </p>
        )}

        {!isNew && current!.status === "pending_approval" && (
          <p className="rounded-lg border border-dashed border-surface-border px-3 py-2.5 text-xs text-ink-faint">
            {t("task.pendingApprovalBanner")}
          </p>
        )}

        {!isNew &&
          current!.status !== "pending_approval" &&
          status === "done" &&
          hasParts && (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              {t("task.markDoneNotice")}
            </p>
          )}

        <div className="border-t border-surface-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">{t("customers.properties")}</p>
            {!isNew && (
              <a
                href={`/print/task/${current!.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-brand-600"
              >
                ⭳ {t("task.downloadReport")}
              </a>
            )}
          </div>

          {/* City / brand / model come from the shared catalog rather than
              per-field option lists, so adding a model on the Catalog page
              shows up here immediately and the model list follows the brand. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("task.city")}</label>
              <ComboSelect
                value={cityId}
                options={cities}
                onChange={setCityId}
                onCreate={createCity}
                emptyLabel={t("customers.noCity")}
              />
            </div>
            <div>
              <label className="label">{t("customers.brand")}</label>
              <select
                className="input"
                value={companyId}
                onChange={(e) => pickBrand(e.target.value)}
              >
                <option value="">{t("customers.noBrand")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="label">{t("task.model")}</label>
            <ComboSelect
              value={modelId}
              options={brandModels}
              onChange={setModelId}
              onCreate={(name) => createModel(companyId, name)}
              emptyLabel={t("customers.noModel")}
              disabled={!companyId}
              disabledHint={t("customers.pickBrandFirst")}
            />
          </div>

          {!isNew && (
            <div className="mt-4">
              <CustomFields
                entity="task"
                recordId={current!.id}
                canManage={canEditData(profile)}
                canEditValues={editable}
              />
            </div>
          )}
        </div>

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("task.partsUsed")}</p>
            <TaskParts taskId={current!.id} editable={editable} onCountChange={(n) => setHasParts(n > 0)} />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t("task.partsCost")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input"
                  value={partsCost}
                  disabled={!editable}
                  placeholder="0.00"
                  onChange={(e) => setPartsCost(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t("task.serviceCharge")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input"
                  value={serviceCharge}
                  disabled={!editable}
                  placeholder="0.00"
                  onChange={(e) => setServiceCharge(e.target.value)}
                />
              </div>
            </div>
            {(partsCost.trim() || serviceCharge.trim()) && (
              <p className="mt-1.5 text-xs text-ink-muted">
                {t("task.total")}:{" "}
                <span className="font-semibold text-ink">
                  {((Number(partsCost) || 0) + (Number(serviceCharge) || 0)).toFixed(2)}
                </span>
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="alert-error">{error}</p>
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
  const t = useT();
  const ids = new Set(assignees.map((a) => a.id));

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

  // Everyone gets the same unconstrained multi-select — any signed-in user
  // assigns or unassigns anyone, including themselves.
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
      {engineers.length === 0 && (
        <span className="text-sm text-ink-faint">{t("task.unassigned")}</span>
      )}
    </div>
  );
}
