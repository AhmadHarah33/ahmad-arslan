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
import Maintenance from "./maintenance";
import QrCode, { customerQrValue } from "@/components/qr-code";
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
    isApproved: m.is_approved,
    pendingAction: m.pending_action,
  };
}

function blankMachine(): MachineRow {
  return { id: null, cityId: "", companyId: "", modelId: "", serial: "", isApproved: true, pendingAction: null };
}

function machineIsBlank(m: MachineRow) {
  return !m.cityId && !m.companyId && !m.modelId && !m.serial.trim();
}

export default function CustomerModal({
  profile,
  companies,
  cities,
  models,
  customer,
  onClose,
  onSaved,
}: {
  profile: Profile;
  companies: Company[];
  cities: City[];
  models: MachineModel[];
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isNew = !customer;
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

  async function save() {
    if (!name.trim()) {
      setValidationError(t("customers.nameRequired"));
      return;
    }
    setValidationError(null);
    const res = await doSave(customer?.id ?? null, {
      name,
      contact_person: contactPerson,
      contact_info: contactInfo,
      status,
      links,
    });
    if (!res) return;
    const customerId = customer?.id;
    if (!customerId) {
      // A brand-new customer has no machines yet to reconcile — this is a
      // name-only insert; machines get added once the customer is reopened,
      // same as parts/custom fields need a saved task first.
      onSaved();
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
        original.serial !== m.serial;
      if (!changed) continue;
      const r = await saveCustomerMachine(customerId, m.id, {
        city_id: m.cityId || null,
        company_id: m.companyId || null,
        model_id: m.modelId || null,
        serial_number: m.serial,
      });
      if (r?.error) toastErr(r.error);
    }
    setSavingMachines(false);
    onSaved();
  }

  function remove() {
    if (!customer) return;
    if (!confirm(t("customers.confirmDelete"))) return;
    setValidationError(null);
    doDelete(customer.id);
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

  const footer = (
    <div className="flex items-center justify-between gap-2">
      {!isNew ? (
        <button className="btn-danger" onClick={remove} disabled={saving}>
          {t("common.delete")}
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        {!isNew && !customer!.is_approved && manager && (
          <>
            <button className="btn-ghost" onClick={reject} disabled={saving}>
              {t("approval.reject")}
            </button>
            <button
              className="btn-primary"
              onClick={() => doApprove(customer!.id)}
              disabled={saving}
            >
              {t("approval.approve")}
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose} disabled={saving}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
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
    >
      <div className="space-y-4">
        {!isNew && !customer!.is_approved && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-3 py-2.5">
            <PendingBadge action={customer!.pending_action} />
            <p className="text-xs text-ink-faint">
              {t("approval.pendingExplain")}
            </p>
          </div>
        )}

        <div>
          <label className="label">{t("customers.name")}</label>
          <input
            className="input"
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("task.status")}</label>
            <select
              className="input"
              value={status}
              disabled={!editable}
              onChange={(e) => setStatus(e.target.value as CustomerStatus)}
            >
              <option value="active">{t("customers.active")}</option>
              <option value="inactive">{t("customers.inactive")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("customers.contactPerson")}</label>
            <input
              className="input"
              value={contactPerson}
              disabled={!editable}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">{t("customers.contactInfo")}</label>
          <input
            className="input"
            value={contactInfo}
            disabled={!editable}
            placeholder="+90 5xx xxx xx xx"
            onChange={(e) => setContactInfo(e.target.value)}
          />
        </div>

        {isNew ? (
          <p className="rounded-lg border border-dashed border-surface-border px-3 py-2.5 text-xs text-ink-faint">
            {t("customers.machinesAfterSave")}
          </p>
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
                  <div key={m.id ?? `new-${i}`} className="rounded-xl border border-surface-border p-3">
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
              recordId={customer!.id}
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
            <p className="label">{t("customers.maintenance")}</p>
            <Maintenance customerId={customer!.id} editable={editable} />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.serviceHistory")}</p>
            <ServiceHistory customerId={customer!.id} />
          </div>
        )}

        {shownError && (
          <p className="alert-error">{shownError}</p>
        )}
      </div>
    </Modal>
  );
}
