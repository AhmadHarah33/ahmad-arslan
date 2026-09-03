"use client";

import { useState } from "react";
import type {
  City,
  Company,
  Customer,
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

type LinkRow = { label: string; url: string };

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
  const [cityId, setCityId] = useState(customer?.city_id ?? "");
  const [modelId, setModelId] = useState(customer?.model_id ?? "");
  const [serial, setSerial] = useState(customer?.serial_number ?? "");
  const [companyId, setCompanyId] = useState(customer?.company_id ?? "");

  // Models belong to a brand, so the list narrows to the brand on this form.
  const brandModels = models.filter((m) => m.company_id === companyId);

  // Switching brand invalidates a model from the old one — better to clear it
  // than to save a customer whose model belongs to a different manufacturer.
  function pickBrand(id: string) {
    setCompanyId(id);
    if (modelId && !models.some((m) => m.id === modelId && m.company_id === id)) {
      setModelId("");
    }
  }
  const [contactPerson, setContactPerson] = useState(customer?.contact_person ?? "");
  const [contactInfo, setContactInfo] = useState(customer?.contact_info ?? "");
  const [status, setStatus] = useState<CustomerStatus>(customer?.status ?? "active");
  const [links, setLinks] = useState<LinkRow[]>(
    customer?.customer_links?.map((l) => ({ label: l.label, url: l.url })) ?? []
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function updateLink(i: number, patch: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // inline: this modal shows the failure in the form, not as a toast.
  const { run: doSave, pending: savingSave, error: saveError } = useAction(
    saveCustomer,
    { inline: true, onSuccess: onSaved }
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
  const saving = savingSave || savingDelete || approving || rejecting;
  // Client-side validation wins over a server message: it is what the user
  // must fix first.
  const shownError = validationError ?? saveError ?? deleteError;

  function save() {
    if (!name.trim()) {
      setValidationError(t("customers.nameRequired"));
      return;
    }
    setValidationError(null);
    doSave(customer?.id ?? null, {
      name,
      // location/machine text is written by the DB from these two.
      city_id: cityId || null,
      model_id: modelId || null,
      serial_number: serial,
      company_id: companyId || null,
      contact_person: contactPerson,
      contact_info: contactInfo,
      status,
      links,
    });
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
            <label className="label">{t("customers.brand")}</label>
            <select
              className="input"
              value={companyId}
              disabled={!editable}
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("customers.city")}</label>
            <ComboSelect
              value={cityId}
              options={cities}
              onChange={setCityId}
              onCreate={createCity}
              emptyLabel={t("customers.noCity")}
            />
          </div>
          <div>
            <label className="label">{t("customers.model")}</label>
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
        <div>
          <label className="label">{t("customers.sn")}</label>
          <input
            className="input"
            value={serial}
            disabled={!editable}
            onChange={(e) => setSerial(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("customers.contactPerson")}</label>
            <input
              className="input"
              value={contactPerson}
              disabled={!editable}
              onChange={(e) => setContactPerson(e.target.value)}
            />
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
        </div>

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
