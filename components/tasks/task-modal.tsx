"use client";

import { useMemo, useState } from "react";
import { CURRENCY_SYMBOLS, TASK_CURRENCIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
import type {
  City,
  Company,
  Customer,
  CustomerMachine,
  MachineModel,
  Profile,
  Task,
  TaskAssignee,
  TaskCurrency,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";
import { canEditData, canEditTask, isHead } from "@/lib/permissions";
import {
  addAssignee,
  createTask,
  deleteTask,
  removeAssignee,
  setLeadAssignee,
  updateTask,
} from "@/app/(app)/tasks/actions";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";
import { statusKey, priorityKey } from "@/lib/i18n/task-keys";
import DescriptionField from "./description-field";
import CustomFields from "@/components/fields/CustomFields";
import TaskParts, { draftPartsTotal, type DraftPart } from "./task-parts";
import DownloadPdfButton from "./download-pdf-button";
import ComboSelect from "@/components/combo-select";
import { formatAmount, sanitizeAmount } from "@/lib/money";
import { createCity, createModel } from "@/app/(app)/catalog/actions";
import { createCustomer } from "@/app/(app)/customers/actions";
import { toastErr } from "@/lib/toast";

type CustomerMachineLite = Pick<
  CustomerMachine,
  "id" | "customer_id" | "city_id" | "company_id" | "model_id" | "serial_number"
>;

export default function TaskModal({
  profile,
  engineers,
  customers,
  companies,
  cities,
  models,
  customerMachines,
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
  customerMachines: CustomerMachineLite[];
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
  // A brand new task has no id, so custom-field values have nothing to
  // attach to yet. Rather than hide Properties behind a second trip through
  // the board, creating a task keeps this modal open and swaps it into edit
  // mode for the row we just made. Parts and assignees, unlike custom
  // fields, are collected locally below and saved together with the task.
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
  // Assignees. New tasks collect them locally (saved with createTask);
  // existing tasks manage membership live via add/remove/lead actions.
  const [assignees, setAssignees] = useState<TaskAssignee[]>(
    task?.assignees ?? (isNew && !isHead(profile) ? [selfLite(profile)] : [])
  );
  const [customerId, setCustomerId] = useState<string>(task?.customer_id ?? "");
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? "");
  const [cityId, setCityId] = useState<string>(task?.city_id ?? "");
  const [companyId, setCompanyId] = useState<string>(task?.company_id ?? "");
  const [modelId, setModelId] = useState<string>(task?.model_id ?? "");
  const [serviceCharge, setServiceCharge] = useState<string>(
    task?.service_charge != null ? String(task.service_charge) : ""
  );
  const [partsCurrency, setPartsCurrency] = useState<TaskCurrency>(
    task?.parts_currency ?? "TRY"
  );
  const [serviceCurrency, setServiceCurrency] = useState<TaskCurrency>(
    task?.service_currency ?? "TRY"
  );

  // Parts for a task that doesn't exist yet — attached in bulk once
  // createTask returns an id. An existing task's parts live in task_parts
  // and TaskParts manages them directly; either way the totals come back
  // through onTotalsChange below.
  const [draftParts, setDraftParts] = useState<DraftPart[]>([]);
  const [partsTotals, setPartsTotals] = useState({ count: 0, total: 0 });

  // Models belong to a brand, so the list narrows to the brand on this task.
  const brandModels = models.filter((m) => m.company_id === companyId);
  function pickBrand(id: string) {
    setCompanyId(id);
    if (modelId && !models.some((m) => m.id === modelId && m.company_id === id)) {
      setModelId("");
    }
  }

  // A customer with exactly one machine autofills city/brand/model outright;
  // with several, offer a pick instead of guessing which one this job is for.
  const machinesForCustomer = useMemo(
    () => customerMachines.filter((m) => m.customer_id === customerId),
    [customerMachines, customerId]
  );
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);

  function applyMachine(m: CustomerMachineLite) {
    setCityId(m.city_id ?? "");
    setCompanyId(m.company_id ?? "");
    setModelId(m.model_id ?? "");
    setMachinePickerOpen(false);
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
    const list = customerMachines.filter((m) => m.customer_id === id);
    if (list.length === 1) {
      applyMachine(list[0]);
      setMachinePickerOpen(false);
    } else if (list.length > 1) {
      setMachinePickerOpen(true);
    } else {
      setMachinePickerOpen(false);
    }
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError(t("task.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const partsCost = isNew ? draftPartsTotal(draftParts) : partsTotals.total;
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
      parts_cost: partsCost || null,
      service_charge: parseAmountText(serviceCharge),
      parts_currency: partsCurrency,
      service_currency: serviceCurrency,
    };
    const leadId = assignees.find((a) => a.is_lead)?.id ?? null;
    const res = isNew
      ? await createTask({
          ...base,
          assignee_ids: assignees.map((a) => a.id),
          lead_assignee_id: leadId,
          parts: draftParts.map((d) => ({
            spare_part_id: d.spare_part_id,
            quantity: d.quantity,
            unit_price: parseAmountText(d.priceText),
          })),
        })
      : await updateTask(current!.id, base);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (!res?.task) return;
    const saved = res.task as Task;
    if (isNew) {
      // Keep the dialog up so Properties / Activity become available
      // immediately for the task that was just created.
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

  const partsCount = isNew ? draftParts.length : partsTotals.count;
  const partsTotal = isNew ? draftPartsTotal(draftParts) : partsTotals.total;

  return (
    <Modal
      title={isNew ? t("task.new") : editable ? t("task.edit") : t("task.one")}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
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
            taskId={current?.id}
            profile={profile}
            engineers={engineers}
            assignees={assignees}
            setAssignees={setAssignees}
          />
        </div>

        <div>
          <label className="label">{t("task.customer")}</label>
          <ComboSelect
            value={customerId}
            options={customers}
            onChange={pickCustomer}
            onCreate={createCustomer}
            emptyLabel={t("task.noCustomer")}
            disabled={!editable}
          />
          {machinePickerOpen && machinesForCustomer.length > 1 && (
            <div className="mt-1.5 rounded-lg border border-dashed border-surface-border p-2">
              <p className="mb-1.5 text-xs text-ink-faint">{t("task.pickMachine")}</p>
              <div className="flex flex-wrap gap-1.5">
                {machinesForCustomer.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip bg-surface-soft text-ink-muted"
                    onClick={() => applyMachine(m)}
                  >
                    {machineLabel(m, companies, cities, models)}
                  </button>
                ))}
                <button
                  type="button"
                  className="text-xs text-ink-faint underline"
                  onClick={() => setMachinePickerOpen(false)}
                >
                  {t("common.dismiss")}
                </button>
              </div>
            </div>
          )}
        </div>

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

        {status === "done" && partsCount > 0 && (!current || current.status !== "pending_approval") && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            {t("task.markDoneNotice")}
          </p>
        )}

        <div className="border-t border-surface-border pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">{t("customers.properties")}</p>
            {!isNew && (
              <div className="flex items-center gap-3">
                <a
                  href={`/print/task/${current!.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-ink-faint underline-offset-2 hover:underline"
                >
                  {t("task.previewReport")}
                </a>
                <DownloadPdfButton taskId={current!.id} />
              </div>
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

        <div className="border-t border-surface-border pt-4">
          <p className="label">{t("task.partsUsed")}</p>
          <TaskParts
            taskId={current?.id}
            editable={editable}
            currencySymbol={CURRENCY_SYMBOLS[partsCurrency]}
            draft={draftParts}
            onDraftChange={setDraftParts}
            onTotalsChange={setPartsTotals}
            companies={companies}
            defaultBrandId={companyId}
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t("task.partsCost")}</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  className="input bg-surface-soft text-ink-muted"
                  value={`${CURRENCY_SYMBOLS[partsCurrency]}${formatAmount(partsTotal)}`}
                  disabled
                  readOnly
                />
                <select
                  className="input w-16 shrink-0 px-1 text-center"
                  value={partsCurrency}
                  disabled={!editable}
                  onChange={(e) => setPartsCurrency(e.target.value as TaskCurrency)}
                >
                  {TASK_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_SYMBOLS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-ink-faint">{t("task.partsCostComputed")}</p>
            </div>
            <div>
              <label className="label">{t("task.serviceCharge")}</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={serviceCharge}
                  disabled={!editable}
                  placeholder="0"
                  onChange={(e) => setServiceCharge(sanitizeAmount(e.target.value))}
                />
                <select
                  className="input w-16 shrink-0 px-1 text-center"
                  value={serviceCurrency}
                  disabled={!editable}
                  onChange={(e) => setServiceCurrency(e.target.value as TaskCurrency)}
                >
                  {TASK_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_SYMBOLS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {(partsTotal > 0 || serviceCharge.trim()) && (
            <p className="mt-1.5 text-xs text-ink-muted">
              {t("task.total")}:{" "}
              <span className="font-semibold text-ink">
                {partsTotal > 0 && (
                  <>
                    {CURRENCY_SYMBOLS[partsCurrency]}
                    {formatAmount(partsTotal)}
                  </>
                )}
                {partsTotal > 0 && serviceCharge.trim() && " + "}
                {serviceCharge.trim() && (
                  <>
                    {CURRENCY_SYMBOLS[serviceCurrency]}
                    {formatAmount(parseAmountText(serviceCharge) ?? 0)}
                  </>
                )}
              </span>
            </p>
          )}
        </div>

        {error && (
          <p className="alert-error">{error}</p>
        )}
      </div>
    </Modal>
  );
}

function parseAmountText(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function machineLabel(
  m: CustomerMachineLite,
  companies: Company[],
  cities: City[],
  models: MachineModel[]
) {
  const brand = companies.find((c) => c.id === m.company_id)?.name;
  const model = models.find((mm) => mm.id === m.model_id)?.name;
  const city = cities.find((c) => c.id === m.city_id)?.name;
  const parts = [brand, model].filter(Boolean).join(" ");
  return [parts || "—", city].filter(Boolean).join(" · ");
}

function selfLite(p: Profile): TaskAssignee {
  return { id: p.id, full_name: p.full_name, first_name: p.first_name, is_lead: false };
}

// Assignee management. Everyone assigns/unassigns anyone (see canEditTask).
// One assignee can additionally be flagged the lead/responsible engineer,
// shown first and used on the printed report.
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
  assignees: TaskAssignee[];
  setAssignees: (v: TaskAssignee[]) => void;
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

  async function toggleLead(p: Profile) {
    const makingLead = !assignees.find((a) => a.id === p.id)?.is_lead;
    const next = assignees.map((a) => ({ ...a, is_lead: a.id === p.id ? makingLead : false }));
    setAssignees(next);
    if (isNew) return; // saved with createTask
    const res = await setLeadAssignee(taskId!, p.id, makingLead);
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
        const lead = assignees.find((a) => a.id === e.id)?.is_lead;
        return (
          <span key={e.id} className="inline-flex items-center gap-0.5">
            <button
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
            {on && (
              <button
                type="button"
                onClick={() => toggleLead(e)}
                title={t("task.leadEngineer")}
                aria-label={t("task.leadEngineer")}
                className={`text-sm ${lead ? "text-amber-500" : "text-ink-faint/40 hover:text-ink-faint"}`}
              >
                ★
              </button>
            )}
          </span>
        );
      })}
      {engineers.length === 0 && (
        <span className="text-sm text-ink-faint">{t("task.unassigned")}</span>
      )}
    </div>
  );
}
