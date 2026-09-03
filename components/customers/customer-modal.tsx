"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { saveCustomer, deleteCustomer } from "@/app/(app)/customers/actions";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";
import CustomFields from "@/components/fields/CustomFields";
import ServiceHistory from "./service-history";
import Maintenance from "./maintenance";
import QrCode, { customerQrValue } from "@/components/qr-code";
import { useAction } from "@/lib/use-action";

type LinkRow = { label: string; url: string };

export default function CustomerModal({
  editable,
  customer,
  onClose,
  onSaved,
}: {
  editable: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isNew = !customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [location, setLocation] = useState(customer?.location ?? "");
  const [machine, setMachine] = useState(customer?.machine ?? "");
  const [serial, setSerial] = useState(customer?.serial_number ?? "");
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
  const saving = savingSave || savingDelete;
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
      location,
      machine,
      serial_number: serial,
      links,
    });
  }

  function remove() {
    if (!customer) return;
    if (!confirm(t("customers.confirmDelete"))) return;
    setValidationError(null);
    doDelete(customer.id);
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
          {t("common.cancel")}
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  ) : undefined;

  return (
    <Modal
      title={isNew ? t("customers.new") : editable ? t("customers.edit") : name}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
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
            <label className="label">{t("customers.city")}</label>
            <input
              className="input"
              value={location}
              disabled={!editable}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("customers.model")}</label>
            <input
              className="input"
              value={machine}
              disabled={!editable}
              onChange={(e) => setMachine(e.target.value)}
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
                    placeholder="Label"
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
            <p className="label">Service history</p>
            <ServiceHistory customerId={customer!.id} />
          </div>
        )}

        {shownError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {shownError}
          </p>
        )}
      </div>
    </Modal>
  );
}
