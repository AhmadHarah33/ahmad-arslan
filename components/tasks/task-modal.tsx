"use client";

import { useMemo, useRef, useState } from "react";
import { CURRENCY_SYMBOLS, STATUS_VAR, TASK_CURRENCIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/types";
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
import type { StringKey } from "@/lib/i18n/dictionary";
import { Avatar } from "@/components/avatar";
import { statusKey, priorityKey } from "@/lib/i18n/task-keys";
import DescriptionField from "./description-field";
import InterventionField from "./intervention-field";
import { upsertFieldValue } from "@/app/(app)/fields/actions";
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
  // Parts cost normally follows the parts list below; typing a number here
  // overrides it (null = follow the list).
  // A saved cost that differs from the parts list is a typed one, so it starts
  // as the override; one that matches the list just follows it.
  const [partsCostText, setPartsCostText] = useState<string | null>(
    task?.parts_cost != null ? String(task.parts_cost) : null
  );
  const prevPartsTotal = useRef<number | null>(null);
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
  // The picked Intervention type, held until a new task has an id to save it to.
  const intervention = useRef<{ fieldId: string; value: string }>({ fieldId: "", value: "" });

  async function save() {
    if (!title.trim()) {
      setError(t("task.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const partsCost =
      partsCostText !== null
        ? parseAmountText(partsCostText) ?? 0
        : isNew
        ? draftPartsTotal(draftParts)
        : partsTotals.total;
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
    if (isNew && intervention.current.fieldId && intervention.current.value) {
      const r = await upsertFieldValue(intervention.current.fieldId, saved.id, intervention.current.value);
      if (r?.error) toastErr(r.error);
    }
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

  const partsCount = isNew ? draftParts.length : partsTotals.count;
  const partsComputed = isNew ? draftPartsTotal(draftParts) : partsTotals.total;
  const partsTotal =
    partsCostText !== null ? parseAmountText(partsCostText) ?? 0 : partsComputed;
  const partsCostShown =
    partsCostText ?? (partsComputed ? String(Math.round(partsComputed * 100) / 100) : "");
  const serviceAmount = parseAmountText(serviceCharge) ?? 0;
  const sameCurrency = partsCurrency === serviceCurrency;
  const totalText =
    partsTotal > 0 || serviceAmount > 0
      ? sameCurrency
        ? `${CURRENCY_SYMBOLS[partsCurrency]}${formatAmount(partsTotal + serviceAmount)}`
        : [
            partsTotal > 0 && `${CURRENCY_SYMBOLS[partsCurrency]}${formatAmount(partsTotal)}`,
            serviceAmount > 0 && `${CURRENCY_SYMBOLS[serviceCurrency]}${formatAmount(serviceAmount)}`,
          ]
            .filter(Boolean)
            .join(" + ")
      : "";

  // Phone only: the machine / parts / cost half of the form folds away.
  const [more, setMore] = useState(false);
  const customerLabel = customers.find((c) => c.id === customerId)?.name ?? "";
  const modelLabel = models.find((m) => m.id === modelId)?.name ?? "";
  const brandLabel = companies.find((c) => c.id === companyId)?.name ?? "";
  const machineLine =
    [brandLabel, modelLabel].filter(Boolean).join(" ") || t("task.machineOptional");

  const sectionCard = "rounded-[20px] bg-surface p-3.5 md:rounded-none md:bg-transparent md:p-0";

  // One look for every amount: currency symbol picker + number in a single box,
  // same height as the footer buttons.
  const moneyField = (
    label: string,
    value: string,
    onText: (v: string) => void,
    currency: TaskCurrency,
    onCurrency: (c: TaskCurrency) => void
  ) => (
    <div className="flex h-12 overflow-hidden rounded-[14px] border-[1.5px] border-surface-border bg-surface focus-within:border-brand-500">
      <select
        aria-label={`${label} — currency`}
        className="w-12 shrink-0 cursor-pointer appearance-none border-r-[1.5px] border-surface-border bg-surface-soft text-center text-sm font-semibold text-ink-muted outline-none"
        value={currency}
        disabled={!editable}
        onChange={(e) => onCurrency(e.target.value as TaskCurrency)}
      >
        {TASK_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {CURRENCY_SYMBOLS[c]}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent px-3 text-[15px] font-medium text-ink outline-none placeholder:text-ink-faint"
        value={value}
        disabled={!editable}
        placeholder="0"
        onChange={(e) => onText(sanitizeAmount(e.target.value))}
      />
    </div>
  );

  const partsInput = moneyField(
    t("task.partsCost"),
    partsCostShown,
    setPartsCostText,
    partsCurrency,
    setPartsCurrency
  );
  const serviceInput = moneyField(
    t("task.serviceCharge"),
    serviceCharge,
    setServiceCharge,
    serviceCurrency,
    setServiceCurrency
  );

  // Desktop costs strip: parts + service = total, kept in the sticky footer.
  const costStrip = (
    <div className="hidden flex-wrap items-end gap-3 md:flex">
      <div className="flex w-44 flex-col gap-1">
        <label className="text-[11px] text-ink-muted">{t("task.partsCost")}</label>
        {partsInput}
      </div>
      <span className="pb-3 text-lg text-ink-faint">+</span>
      <div className="flex w-44 flex-col gap-1">
        <label className="text-[11px] text-ink-muted">{t("task.serviceCharge")}</label>
        {serviceInput}
      </div>
      <span className="pb-3 text-lg text-ink-faint">=</span>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-muted">{t("task.total")}</span>
        <div className="flex h-12 min-w-[110px] items-center rounded-[14px] bg-brand-800 px-4 text-lg font-bold text-white">
          {totalText || "—"}
        </div>
      </div>
    </div>
  );

  const footer = editable ? (
    <div className="flex flex-wrap items-end justify-between gap-3">
      {costStrip}
      {!isNew ? (
        <button
          className="h-12 rounded-[14px] border-[1.5px] px-4 text-sm font-semibold transition hover:bg-surface-soft disabled:opacity-50"
          style={{
            borderColor: "rgb(var(--tone-stuck) / var(--tone-ring))",
            color: "rgb(var(--tone-stuck-ink))",
          }}
          onClick={remove}
          disabled={saving}
        >
          {t("common.delete")}
        </button>
      ) : (
        <span className="md:hidden" />
      )}
      <div className="ml-auto flex gap-2">
        <button
          className="h-12 rounded-[14px] bg-surface-soft px-[18px] text-sm font-semibold text-ink transition hover:opacity-80 disabled:opacity-50"
          onClick={onClose}
          disabled={saving}
        >
          {createdTask ? t("task.done") : t("common.cancel")}
        </button>
        <button
          className="h-12 rounded-[14px] bg-ink px-6 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          {saving ? t("common.saving") : isNew ? t("task.create") : t("common.save")}
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
      xl
    >
      <div className="flex flex-col gap-4 bg-[rgb(var(--canvas))] p-4 md:flex-row md:gap-0 md:bg-transparent md:p-0">
        {/* ---- Main column ---- */}
        <div className="contents md:flex md:min-w-0 md:flex-[2_1_0] md:flex-col md:gap-5 md:px-6 md:py-5">
          {/* Phone: live preview of the task being written */}
          <section
            aria-label="Preview"
            className="order-1 flex flex-col gap-2.5 rounded-[20px] bg-brand-800 p-4 text-white md:hidden"
          >
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-white/15 px-2.5 py-[3px] font-semibold">
                {t(statusKey(status))}
              </span>
              <span className="text-brand-200">{dueDate || t("task.noDue")}</span>
              <span className="flex-1" />
              <span className="flex items-center gap-1.5 text-brand-200">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: `rgb(var(${PRIORITY_VAR[priority]}))` }}
                />
                {t(priorityKey(priority))}
              </span>
            </div>
            <span
              className={`text-[15px] font-semibold leading-snug ${title.trim() ? "" : "text-white/45"}`}
            >
              {title.trim() || t("task.untitled")}
            </span>
            <div className="flex items-center gap-2 text-[11px] text-brand-200">
              <span className="flex">
                {assignees.slice(0, 4).map((a) => (
                  <span key={a.id} className="-mr-1.5 rounded-full ring-2 ring-brand-800">
                    <Avatar id={a.id} name={a.full_name || a.first_name} size={24} solid />
                  </span>
                ))}
              </span>
              <span className="flex-1 truncate pl-2">{customerLabel || t("task.noCustomer")}</span>
              {totalText && <span className="text-[13px] font-semibold text-white">{totalText}</span>}
            </div>
          </section>

          <div className="order-2">
            <label className="label" htmlFor="task-title">
              {t("task.title")} <span className="text-[rgb(var(--tone-stuck-ink))]">*</span>
            </label>
            <input
              id="task-title"
              className="input !h-[54px] !rounded-[14px] !px-4 !text-[17px] font-medium"
              value={title}
              disabled={!editable}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("task.titlePlaceholder")}
            />
          </div>

          <div className="order-3">
            <DescriptionField
              value={description}
              onChange={setDescription}
              disabled={!editable}
            />
          </div>

          <div className={`order-4 ${sectionCard}`}>
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

          {(createdTask ||
            (!isNew && current!.status === "pending_approval") ||
            (status === "done" &&
              partsCount > 0 &&
              (!current || current.status !== "pending_approval"))) && (
            <div className="order-5 flex flex-col gap-2 md:order-none">
              {createdTask && (
                <p
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{ background: "rgb(var(--tone-done) / 0.14)", color: "rgb(var(--tone-done-ink))" }}
                >
                  {t("task.created")}
                </p>
              )}
              {!isNew && current!.status === "pending_approval" && (
                <p className="rounded-xl border border-dashed border-surface-border px-3 py-2.5 text-xs text-ink-muted">
                  {t("task.pendingApprovalBanner")}
                </p>
              )}
              {status === "done" && partsCount > 0 && (!current || current.status !== "pending_approval") && (
                <p
                  className="rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: "rgb(var(--tone-warn) / 0.16)", color: "rgb(var(--tone-warn-ink))" }}
                >
                  {t("task.markDoneNotice")}
                </p>
              )}
            </div>
          )}

          {/* Phone: teal toggle for the machine / parts / cost half */}
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            className="order-[8] flex min-h-[56px] items-center gap-2.5 rounded-[20px] bg-[rgb(var(--tone-done-ink))] px-3.5 py-2.5 text-left text-white md:hidden"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12.5px] font-semibold">{t("task.machineParts")}</span>
              <span className="truncate text-[11px] text-white/75">
                {machineLine}
                {partsCount > 0 ? ` · ${partsCount}` : ""}
              </span>
            </span>
            {partsTotal > 0 && (
              <span className="text-[13px] font-semibold">
                {CURRENCY_SYMBOLS[partsCurrency]}
                {formatAmount(partsTotal)}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${more ? "rotate-180" : ""}`} />
          </button>

          {/* Parts used + custom properties */}
          <div
            className={`order-[10] flex-col gap-4 rounded-[20px] bg-surface p-3.5 md:flex md:rounded-[18px] md:bg-surface-soft md:p-4 ${
              more ? "flex" : "hidden"
            }`}
          >
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-ink">{t("task.partsUsed")}</p>
                {!isNew && (
                  <div className="flex items-center gap-3">
                    <a
                      href={`/print/task/${current!.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-ink-muted underline-offset-2 hover:underline"
                    >
                      {t("task.previewReport")}
                    </a>
                    <DownloadPdfButton taskId={current!.id} />
                  </div>
                )}
              </div>
              <TaskParts
                taskId={current?.id}
                editable={editable}
                currencySymbol={CURRENCY_SYMBOLS[partsCurrency]}
                draft={draftParts}
                onDraftChange={setDraftParts}
                onTotalsChange={(totals) => {
                  setPartsTotals(totals);
                  const prev = prevPartsTotal.current;
                  prevPartsTotal.current = totals.total;
                  if (prev === null) {
                    // First report is the loaded list: if the saved cost is just
                    // that list's total, keep following it.
                    if (task?.parts_cost != null && Math.abs(totals.total - task.parts_cost) < 0.005) {
                      setPartsCostText(null);
                    }
                  } else if (Math.abs(prev - totals.total) > 0.0001) {
                    // Parts were added/removed/repriced: follow the list again.
                    setPartsCostText(null);
                  }
                }}
                companies={companies}
                defaultBrandId={companyId}
              />
            </div>

            {!isNew && (
              <div className="border-t border-surface-border pt-4">
                <p className="label">{t("customers.properties")}</p>
                <CustomFields
                  entity="task"
                  recordId={current!.id}
                  canManage={canEditData(profile)}
                  canEditValues={editable}
                  hideNames={["Yer", "Makina", "Müdahale*", "Intervention*"]}
                />
              </div>
            )}

            {/* Phone only: the cost fields live in the footer on desktop */}
            <div className="grid grid-cols-2 gap-3 border-t border-surface-border pt-4 md:hidden">
              <div>
                <label className="label">{t("task.partsCost")}</label>
                {partsInput}
              </div>
              <div>
                <label className="label">{t("task.serviceCharge")}</label>
                {serviceInput}
              </div>
            </div>
          </div>
        </div>

        {/* ---- Side column ---- */}
        <div className="contents md:flex md:max-w-[380px] md:flex-[1_1_0] md:flex-col md:gap-4 md:border-l md:border-surface-border md:bg-surface-soft md:px-6 md:py-5">
          <div className={`order-6 ${sectionCard}`}>
            <label className="label">{t("task.status")}</label>
            <div role="radiogroup" aria-label={t("task.status")} className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.filter(
                (s) => s.key !== "pending_approval" || status === "pending_approval"
              ).map((s) => {
                const on = status === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!editable}
                    onClick={() => setStatus(s.key)}
                    className={`flex h-9 items-center gap-1.5 rounded-full border-[1.5px] bg-surface px-3 text-xs font-semibold text-ink transition disabled:opacity-60 ${
                      on ? "border-ink" : "border-surface-border hover:border-ink-faint"
                    }`}
                  >
                    <span
                      className="h-[7px] w-[7px] rounded-full"
                      style={{ background: `rgb(var(${STATUS_VAR[s.key]}))` }}
                    />
                    {t(statusKey(s.key))}
                  </button>
                );
              })}
            </div>

            <label className="label mt-4">{t("task.priority")}</label>
            <div
              role="radiogroup"
              aria-label={t("task.priority")}
              className="grid grid-cols-3 gap-1 rounded-[13px] bg-surface-soft p-1 md:bg-[rgb(var(--tone-neutral)/0.14)]"
            >
              {TASK_PRIORITIES.map((p) => {
                const on = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!editable}
                    onClick={() => setPriority(p)}
                    className={`flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold transition disabled:opacity-60 ${
                      on ? "bg-surface shadow-card" : "text-ink-muted"
                    }`}
                    style={on ? { color: `rgb(var(${PRIORITY_VAR[p]}-ink))` } : undefined}
                  >
                    {t(priorityKey(p))}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`order-7 ${sectionCard}`}>
            <label className="label" htmlFor="task-due">
              {t("task.dueDate")}
            </label>
            <input
              id="task-due"
              type="date"
              className="input"
              value={dueDate}
              disabled={!editable}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {editable && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { k: "task.dueToday", d: 0 },
                  { k: "task.dueTomorrow", d: 1 },
                  { k: "task.dueWeek", d: 7 },
                ].map((q) => (
                  <button
                    key={q.k}
                    type="button"
                    onClick={() => setDueDate(isoInDays(q.d))}
                    className="h-8 rounded-full bg-surface px-3 text-xs font-medium text-ink-muted transition hover:text-ink md:bg-surface"
                  >
                    {t(q.k as StringKey)}
                  </button>
                ))}
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate("")}
                    className="h-8 px-2 text-xs text-ink-faint underline"
                  >
                    {t("common.clear")}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`order-[7] ${sectionCard}`}>
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
              <div className="mt-1.5 rounded-xl border border-dashed border-surface-border p-2">
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

          <div className={`order-[7] ${sectionCard}`}>
            <InterventionField
              recordId={current?.id}
              disabled={!editable}
              onPick={(fieldId, value) => {
                intervention.current = { fieldId, value };
              }}
            />
          </div>

          {/* City / brand / model come from the shared catalog rather than
              per-field option lists, so adding a model on the Catalog page
              shows up here immediately and the model list follows the brand. */}
          <div
            className={`order-[9] flex-col gap-3 rounded-[20px] bg-surface p-3.5 md:flex md:rounded-none md:bg-transparent md:p-0 ${
              more ? "flex" : "hidden"
            }`}
          >
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
            <div>
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
          </div>
        </div>
      </div>

      {error && (
        <p className="alert-error mx-4 mb-4 md:mx-6">{error}</p>
      )}

    </Modal>
  );
}

const PRIORITY_VAR: Record<TaskPriority, string> = {
  low: "--tone-done",
  medium: "--tone-warn",
  high: "--tone-stuck",
};

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ChevronDown(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
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
    <div className="flex flex-wrap gap-2">
      {engineers.map((e) => {
        const on = ids.has(e.id);
        const lead = assignees.find((a) => a.id === e.id)?.is_lead;
        const name = e.full_name || e.first_name;
        return (
          <span
            key={e.id}
            className={`inline-flex items-center rounded-full border-[1.5px] transition ${
              on ? "border-brand-800 bg-brand-50" : "border-surface-border bg-surface"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(e)}
              aria-pressed={on}
              className="flex h-[41px] items-center gap-2 pl-1.5 pr-3 text-[13px] font-semibold text-ink"
            >
              <Avatar id={e.id} name={name} size={28} />
              {name}
              {e.id === profile.id && (
                <span className="text-[11px] font-normal text-ink-muted">({t("task.you")})</span>
              )}
            </button>
            {on && (
              <button
                type="button"
                onClick={() => toggleLead(e)}
                title={t("task.leadEngineer")}
                aria-label={t("task.leadEngineer")}
                className={`mr-2 text-sm ${lead ? "text-amber-500" : "text-ink-faint/50 hover:text-ink-faint"}`}
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
