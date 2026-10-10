"use client";

import { useState } from "react";
import type {
  City,
  Company,
  Customer,
  CustomerMachine,
  CustomerStatus,
  MachineModel,
  Profile,
} from "@/lib/types";
import ComboSelect from "@/components/combo-select";
import { createCity, createModel } from "@/app/(app)/catalog/actions";
import {
  saveCustomer,
  deleteCustomer,
  approveCustomer,
  rejectCustomer,
  saveCustomerMachine,
  deleteCustomerMachine,
  approveCustomerMachine,
  rejectCustomerMachine,
} from "@/app/(app)/customers/actions";
import { isManager } from "@/lib/permissions";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";
import CustomFields from "@/components/fields/CustomFields";
import ServiceHistory from "./service-history";
import HistoryFileButton from "./history-file-button";
import CustomerAgreements from "./customer-agreements";
import QrCode from "@/components/qr-code";
import { customerQrValue } from "@/lib/qr";
import { useAction } from "@/lib/use-action";
import PendingBadge from "@/components/pending-badge";
import { toastErr } from "@/lib/toast";

type LinkRow = { label: string; url: string };
type MachineRow = {
  id: string | null; // null = not yet saved
  cityId: string;
  companyId: string;
  modelId: string;
  serial: string;
  // Standard (factory) warranty end, "" when unknown.
  warrantyEnd: string;
  isApproved: boolean;
  pendingAction: CustomerMachine["pending_action"];
};

function toMachineRow(m: CustomerMachine): MachineRow {
  return {
    id: m.id,
    cityId: m.city_id ?? "",
    companyId: m.company_id ?? "",
    modelId: m.model_id ?? "",
    serial: m.serial_number ?? "",
    warrantyEnd: m.warranty_end ?? "",
    isApproved: m.is_approved,
    pendingAction: m.pending_action,
  };
}

function initialsOf(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
}

function blankMachine(): MachineRow {
  return { id: null, cityId: "", companyId: "", modelId: "", serial: "", warrantyEnd: "", isApproved: true, pendingAction: null };
}

function machineIsBlank(m: MachineRow) {
  return !m.cityId && !m.companyId && !m.modelId && !m.serial.trim() && !m.warrantyEnd;
}

export default function CustomerModal({
  profile,
  companies,
  cities,
  models,
  customer,
  onClose,
  onSaved,
  onChanged,
}: {
  profile: Profile;
  companies: Company[];
  cities: City[];
  models: MachineModel[];
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
  // Called when the list behind should refresh but the modal stays open
  // ("Save & add machines").
  onChanged?: () => void;
}) {
  const t = useT();
  // "Save & add machines" turns a just-created customer into an edit session
  // in place, so machines can be added without closing and reopening.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const cid = customer?.id ?? createdId;
  const isNew = !cid;
  // Everyone can create/edit; a non-manager's write just lands pending
  // review (see the customers_gate_upsert trigger). The form itself never
  // needs to be read-only.
  const editable = true;
  const manager = isManager(profile);

  const [name, setName] = useState(customer?.name ?? "");
  const [contactPerson, setContactPerson] = useState(customer?.contact_person ?? "");
  const [contactInfo, setContactInfo] = useState(customer?.contact_info ?? "");
  const [status, setStatus] = useState<CustomerStatus>(customer?.status ?? "active");
  const [links, setLinks] = useState<LinkRow[]>(
    customer?.customer_links?.map((l) => ({ label: l.label, url: l.url })) ?? []
  );
  const initialMachines =
    customer?.customer_machines
      ?.slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(toMachineRow) ?? [];
  const [machines, setMachines] = useState<MachineRow[]>(
    initialMachines.length > 0 ? initialMachines : [blankMachine()]
  );
  const [removedMachineIds, setRemovedMachineIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  function updateLink(i: number, patch: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function updateMachine(i: number, patch: Partial<MachineRow>) {
    setMachines((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function pickMachineBrand(i: number, companyId: string) {
    setMachines((prev) =>
      prev.map((m, idx) => {
        if (idx !== i) return m;
        const modelStillValid = models.some((mm) => mm.id === m.modelId && mm.company_id === companyId);
        return { ...m, companyId, modelId: modelStillValid ? m.modelId : "" };
      })
    );
  }

  function addMachine() {
    setMachines((prev) => [...prev, blankMachine()]);
  }

  function removeMachine(i: number) {
    const m = machines[i];
    if (m.id) setRemovedMachineIds((prev) => [...prev, m.id!]);
    setMachines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // inline: this modal shows the failure in the form, not as a toast.
  const { run: doSave, pending: savingSave, error: saveError } = useAction(
    saveCustomer,
    { inline: true }
  );
  const { run: doDelete, pending: savingDelete, error: deleteError } = useAction(
    deleteCustomer,
    { inline: true, onSuccess: onSaved }
  );
  const { run: doApprove, pending: approving } = useAction(approveCustomer, {
    onSuccess: onSaved,
  });
  const { run: doReject, pending: rejecting } = useAction(rejectCustomer, {
    onSuccess: onSaved,
  });
  const [savingMachines, setSavingMachines] = useState(false);
  const saving = savingSave || savingDelete || approving || rejecting || savingMachines;
  // Client-side validation wins over a server message: it is what the user
  // must fix first.
  const shownError = validationError ?? saveError ?? deleteError;

  async function save(andMachines = false) {
    if (!name.trim()) {
      setValidationError(t("customers.nameRequired"));
      return;
    }
    setValidationError(null);
    const res = await doSave(cid, {
      name,
      contact_person: contactPerson,
      contact_info: contactInfo,
      status,
      links,
    });
    if (!res) return;
    const customerId = cid ?? (res as { id?: string }).id;
    if (!customerId) {
      onSaved();
      return;
    }
    if (!cid) {
      // A brand-new customer has no machines yet to reconcile. Either close,
      // or stay and switch into edit mode so machines can be added now.
      if (andMachines) {
        setCreatedId(customerId);
        onChanged?.();
      } else {
        onSaved();
      }
      return;
    }

    setSavingMachines(true);
    for (const id of removedMachineIds) {
      const r = await deleteCustomerMachine(id);
      if (r?.error) toastErr(r.error);
    }
    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      const original = initialMachines.find((o) => o.id === m.id);
      if (machineIsBlank(m)) continue;
      const changed =
        !original ||
        original.cityId !== m.cityId ||
        original.companyId !== m.companyId ||
        original.modelId !== m.modelId ||
        original.serial !== m.serial ||
        original.warrantyEnd !== m.warrantyEnd;
      if (!changed) continue;
      const r = await saveCustomerMachine(customerId, m.id, {
        city_id: m.cityId || null,
        company_id: m.companyId || null,
        model_id: m.modelId || null,
        serial_number: m.serial,
        warranty_end: m.warrantyEnd || null,
      });
      if (r?.error) toastErr(r.error);
    }
    setSavingMachines(false);
    onSaved();
  }

  function remove() {
    if (!cid) return;
    if (!confirm(t("customers.confirmDelete"))) return;
    setValidationError(null);
    doDelete(cid);
  }

  function reject() {
    if (!customer) return;
    const key =
      customer.pending_action === "delete"
        ? "approval.rejectConfirmDelete"
        : customer.pending_action === "insert"
        ? "approval.rejectConfirmInsert"
        : "approval.rejectConfirm";
    if (!confirm(t(key))) return;
    doReject(customer.id);
  }

  async function approveMachine(id: string) {
    const r = await approveCustomerMachine(id);
    if (r?.error) return toastErr(r.error);
    onSaved();
  }

  async function rejectMachine(id: string) {
    if (!confirm(t("approval.rejectConfirm"))) return;
    const r = await rejectCustomerMachine(id);
    if (r?.error) return toastErr(r.error);
    onSaved();
  }

  const btn = "h-12 rounded-[14px] px-[18px] text-sm font-semibold transition disabled:opacity-50";
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {!isNew ? (
        <button
          className={`${btn} border-[1.5px] hover:bg-surface-soft`}
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
        <span className="hidden text-xs text-ink-muted sm:block">
          <span style={{ color: "rgb(var(--tone-stuck-ink))" }}>*</span> {t("customers.required")}
        </span>
      )}
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {customer && !customer.is_approved && manager && (
          <>
            <button className={`${btn} bg-surface-soft text-ink`} onClick={reject} disabled={saving}>
              {t("approval.reject")}
            </button>
            <button
              className={`${btn} bg-brand-800 text-white`}
              onClick={() => doApprove(customer.id)}
              disabled={saving}
            >
              {t("approval.approve")}
            </button>
          </>
        )}
        <button className={`${btn} bg-surface-soft text-ink`} onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </button>
        {isNew && (
          <button
            className={`${btn} border-[1.5px] border-brand-600 bg-surface text-brand-600`}
            onClick={() => save(true)}
            disabled={saving}
          >
            {t("customers.saveAndMachines")}
          </button>
        )}
        <button className={`${btn} bg-ink px-6 text-surface hover:opacity-90`} onClick={() => save()} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      title={isNew ? t("customers.new") : t("customers.edit")}
      onClose={onClose}
      footer={footer}
      wide
    >
      <div className="space-y-4">
        {customer && !customer.is_approved && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-3 py-2.5">
            <PendingBadge action={customer.pending_action} />
            <p className="text-xs text-ink-faint">
              {t("approval.pendingExplain")}
            </p>
          </div>
        )}

        {/* Phone: live preview, with the active/inactive switch on it */}
        <section
          aria-label="Preview"
          className="flex items-center gap-3 rounded-[20px] bg-brand-800 p-3.5 text-white md:hidden"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-emerald-500 text-[15px] font-semibold"
          >
            {name.trim() ? initialsOf(name) : "+"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={`truncate text-[15px] font-semibold ${name.trim() ? "" : "text-white/45"}`}>
              {name.trim() || t("customers.new")}
            </span>
            <span className="truncate text-[11px] text-brand-200">
              {contactInfo.trim() || t("customers.noPhoneYet")}
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-brand-200">
              {t("customers.colWarranty")}
            </span>
            <div role="radiogroup" aria-label={t("customers.colWarranty")} className="flex rounded-full bg-white/[0.14] p-[3px]">
              {(["active", "inactive"] as const).map((v) => {
                const on = status === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStatus(v)}
                    className={`h-8 min-w-[52px] rounded-full px-3 text-xs font-semibold transition ${
                      on ? "bg-white text-brand-800" : "text-white/80"
                    }`}
                  >
                    {t(v === "active" ? "customers.warrantyIn" : "customers.warrantyOut")}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div>
          <label className="label" htmlFor="cust-name">
            {t("customers.name")} <span style={{ color: "rgb(var(--tone-stuck-ink))" }}>*</span>
          </label>
          <input
            id="cust-name"
            className="input !h-[50px] !rounded-[14px] !px-4 !text-[15px]"
            value={name}
            disabled={!editable}
            placeholder={t("customers.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="hidden md:block">
          <label className="label">{t("customers.colWarranty")}</label>
          <div role="radiogroup" aria-label={t("customers.colWarranty")} className="grid grid-cols-2 gap-2">
            {(["active", "inactive"] as const).map((v) => {
              const on = status === v;
              const tone = v === "active" ? "--tone-done" : "--tone-neutral";
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!editable}
                  onClick={() => setStatus(v)}
                  className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] text-sm font-semibold transition"
                  style={
                    on
                      ? {
                          borderColor: `rgb(var(${tone}-ink))`,
                          background: `rgb(var(${tone}) / 0.14)`,
                          color: `rgb(var(${tone}-ink))`,
                        }
                      : { borderColor: "rgb(var(--surface-border))", color: "rgb(var(--ink-muted))" }
                  }
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${tone}-ink))` }} />
                  {t(v === "active" ? "customers.warrantyIn" : "customers.warrantyOut")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cust-person">{t("customers.contactPerson")}</label>
            <input
              id="cust-person"
              className="input !h-[50px] !rounded-[14px] !px-4 !text-[15px]"
              value={contactPerson}
              disabled={!editable}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="cust-phone">{t("customers.contactInfo")}</label>
            <input
              id="cust-phone"
              type="tel"
              inputMode="tel"
              className="input !h-[50px] !rounded-[14px] !px-4 !text-[15px]"
              value={contactInfo}
              disabled={!editable}
              placeholder="+90 5xx xxx xx xx"
              onChange={(e) => setContactInfo(e.target.value)}
            />
          </div>
        </div>

        {isNew ? (
          <div className="flex items-center gap-3.5 rounded-[18px] border-[1.5px] border-dashed border-surface-border bg-surface-soft px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{t("customers.machines")}</span>
              <span className="text-xs text-ink-muted">{t("customers.machinesAfterSave")}</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0">{t("customers.machines")}</label>
              {editable && (
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600"
                  onClick={addMachine}
                >
                  {t("customers.addMachine")}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {machines.map((m, i) => {
                const brandModels = models.filter((mm) => mm.company_id === m.companyId);
                return (
                  <div key={m.id ?? `new-${i}`} className="rounded-2xl bg-surface-soft p-3.5">
                    {m.id && !m.isApproved && (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <PendingBadge action={m.pendingAction} />
                        {manager && (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className="btn-ghost h-7 px-2.5 text-xs"
                              onClick={() => rejectMachine(m.id!)}
                            >
                              {t("approval.reject")}
                            </button>
                            <button
                              type="button"
                              className="btn-primary h-7 px-2.5 text-xs"
                              onClick={() => approveMachine(m.id!)}
                            >
                              {t("approval.approve")}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">{t("customers.city")}</label>
                        <ComboSelect
                          value={m.cityId}
                          options={cities}
                          onChange={(v) => updateMachine(i, { cityId: v })}
                          onCreate={createCity}
                          emptyLabel={t("customers.noCity")}
                        />
                      </div>
                      <div>
                        <label className="label">{t("customers.brand")}</label>
                        <select
                          className="input"
                          value={m.companyId}
                          onChange={(e) => pickMachineBrand(i, e.target.value)}
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
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">{t("customers.model")}</label>
                        <ComboSelect
                          value={m.modelId}
                          options={brandModels}
                          onChange={(v) => updateMachine(i, { modelId: v })}
                          onCreate={(name) => createModel(m.companyId, name)}
                          emptyLabel={t("customers.noModel")}
                          disabled={!m.companyId}
                          disabledHint={t("customers.pickBrandFirst")}
                        />
                      </div>
                      <div>
                        <label className="label">{t("customers.sn")}</label>
                        <input
                          className="input"
                          value={m.serial}
                          onChange={(e) => updateMachine(i, { serial: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="label">{t("customers.warrantyEnds")}</label>
                      <input
                        type="date"
                        className="input"
                        value={m.warrantyEnd}
                        onChange={(e) => updateMachine(i, { warrantyEnd: e.target.value })}
                      />
                    </div>
                    {machines.length > 1 && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium"
                        style={{ color: "rgb(var(--tone-stuck-ink))" }}
                        onClick={() => removeMachine(i)}
                      >
                        {t("customers.removeMachine")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0">{t("customers.links")}</label>
            {editable && (
              <button
                type="button"
                className="text-sm font-medium text-brand-600"
                onClick={() => setLinks((p) => [...p, { label: "", url: "" }])}
              >
                {t("customers.addLink")}
              </button>
            )}
          </div>
          {links.length === 0 && (
            <p className="text-sm text-ink-faint">
              {t("customers.noLinks")}
            </p>
          )}
          <div className="space-y-2">
            {links.map((l, i) =>
              editable ? (
                <div key={i} className="flex gap-2">
                  <input
                    className="input w-1/3"
                    placeholder={t("customers.linkLabel")}
                    value={l.label}
                    onChange={(e) => updateLink(i, { label: e.target.value })}
                  />
                  <input
                    className="input flex-1"
                    placeholder="https://drive.google.com/…"
                    value={l.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-ghost px-3"
                    onClick={() =>
                      setLinks((p) => p.filter((_, idx) => idx !== i))
                    }
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate rounded-lg bg-surface-soft px-3 py-2 text-sm font-medium text-brand-600"
                >
                  🔗 {l.label || l.url}
                </a>
              )
            )}
          </div>
        </div>

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.properties")}</p>
            <CustomFields
              entity="customer"
              hideNames={["Brand", "Warranty"]}
              recordId={cid!}
              canManage={editable}
              canEditValues={editable}
            />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.qr")}</p>
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-white p-2">
                <QrCode value={customerQrValue(name)} size={120} />
              </div>
              <p className="text-xs text-ink-faint">
                Print and stick this on the unit. Scanning it opens this
                customer in the app.
              </p>
            </div>
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.agreements")}</p>
            <CustomerAgreements customerId={cid!} />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.serviceHistory")}</p>
            <HistoryFileButton customerId={cid!} />
            <ServiceHistory customerId={cid!} />
          </div>
        )}

        {shownError && (
          <p className="alert-error">{shownError}</p>
        )}
      </div>
    </Modal>
  );
}
