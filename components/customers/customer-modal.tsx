"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import { saveCustomer, deleteCustomer } from "@/app/(app)/customers/actions";
import Modal from "@/components/modal";
import CustomFields from "@/components/fields/CustomFields";
import ServiceHistory from "./service-history";
import Maintenance from "./maintenance";

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
  const isNew = !customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [location, setLocation] = useState(customer?.location ?? "");
  const [machine, setMachine] = useState(customer?.machine ?? "");
  const [serial, setSerial] = useState(customer?.serial_number ?? "");
  const [links, setLinks] = useState<LinkRow[]>(
    customer?.customer_links?.map((l) => ({ label: l.label, url: l.url })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLink(i: number, patch: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveCustomer(customer?.id ?? null, {
      name,
      location,
      machine,
      serial_number: serial,
      links,
    });
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!customer) return;
    if (!confirm("Delete this customer?")) return;
    setSaving(true);
    const res = await deleteCustomer(customer.id);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      title={isNew ? "New customer" : editable ? "Edit customer" : name}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input
              className="input"
              value={location}
              disabled={!editable}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Model</label>
            <input
              className="input"
              value={machine}
              disabled={!editable}
              onChange={(e) => setMachine(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">SN</label>
          <input
            className="input"
            value={serial}
            disabled={!editable}
            onChange={(e) => setSerial(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0">Attachment links</label>
            {editable && (
              <button
                type="button"
                className="text-sm font-medium text-brand-600"
                onClick={() => setLinks((p) => [...p, { label: "", url: "" }])}
              >
                + Add link
              </button>
            )}
          </div>
          {links.length === 0 && (
            <p className="text-sm text-ink-faint">
              No links yet (e.g. paste a Google Drive URL).
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
            <p className="label">Properties</p>
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
            <p className="label">Preventive maintenance</p>
            <Maintenance customerId={customer!.id} editable={editable} />
          </div>
        )}

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">Service history</p>
            <ServiceHistory customerId={customer!.id} />
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
      </div>
    </Modal>
  );
}
