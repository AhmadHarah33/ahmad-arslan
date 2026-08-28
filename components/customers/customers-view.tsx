"use client";

import { useMemo, useState } from "react";
import type { Customer, Profile } from "@/lib/types";
import { canEditData } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import type { FieldDefinition } from "@/lib/customFields";
import FieldValue from "@/components/fields/FieldValue";
import CustomerModal from "./customer-modal";

type ValueMap = Record<string, Record<string, unknown>>;

export default function CustomersView({
  profile,
  initialCustomers,
  fieldDefs,
  fieldValues,
}: {
  profile: Profile;
  initialCustomers: Customer[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ open: boolean; customer: Customer | null }>(
    { open: false, customer: null }
  );
  const editable = canEditData(profile);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialCustomers;
    return initialCustomers.filter((c) =>
      [c.name, c.location, c.machine, c.serial_number]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, initialCustomers]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">Customers</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {initialCustomers.length} total
          </p>
        </div>
        {editable && (
          <button
            className="btn-primary"
            onClick={() => setModal({ open: true, customer: null })}
          >
            + New
          </button>
        )}
      </div>

      <input
        className="input mb-4"
        placeholder="Search name, location, machine or SN…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          No customers found.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setModal({ open: true, customer: c })}
              className="card block p-4 text-left transition hover:shadow-pop"
            >
              <p className="font-semibold text-ink">{c.name}</p>
              {c.location && (
                <p className="mt-0.5 text-sm text-ink-muted">📍 {c.location}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
                {c.machine && <span>Model: {c.machine}</span>}
                {c.serial_number && <span>SN: {c.serial_number}</span>}
              </div>
              <CustomerTags
                customerId={c.id}
                defs={fieldDefs}
                values={fieldValues}
              />
              {c.customer_links && c.customer_links.length > 0 && (
                <p className="mt-2 text-xs font-medium text-brand-600">
                  {c.customer_links.length} link
                  {c.customer_links.length === 1 ? "" : "s"} attached
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {modal.open && (
        <CustomerModal
          editable={editable}
          customer={modal.customer}
          onClose={() => setModal({ open: false, customer: null })}
          onSaved={() => {
            setModal({ open: false, customer: null });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// Render a customer's tag-style custom fields (Brand, Warranty…) as chips.
function CustomerTags({
  customerId,
  defs,
  values,
}: {
  customerId: string;
  defs: FieldDefinition[];
  values: ValueMap;
}) {
  const recVals = values[customerId];
  if (!recVals) return null;
  const chips = defs
    .filter((d) => d.field_type === "select" || d.field_type === "multi_select")
    .filter((d) => recVals[d.id] != null && recVals[d.id] !== "")
    .slice(0, 3)
    .map((d) => <FieldValue key={d.id} def={d} value={recVals[d.id]} />);
  if (chips.length === 0) return null;
  return <div className="mt-2 flex flex-wrap gap-1">{chips}</div>;
}
