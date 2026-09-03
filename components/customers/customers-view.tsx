"use client";

import { useMemo, useState } from "react";
import type { Customer, Profile } from "@/lib/types";
import { canEditData } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import type { FieldDefinition } from "@/lib/customFields";
import FieldValue from "@/components/fields/FieldValue";
import ImportExport from "@/components/data/import-export";
import { dueStatus, formatDate } from "@/lib/dates";
import Fab from "@/components/fab";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import CustomerModal from "./customer-modal";

type ValueMap = Record<string, Record<string, unknown>>;

export default function CustomersView({
  profile,
  initialCustomers,
  fieldDefs,
  fieldValues,
  initialQuery = "",
}: {
  profile: Profile;
  initialCustomers: Customer[];
  fieldDefs: FieldDefinition[];
  fieldValues: ValueMap;
  initialQuery?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
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

  // The Brand custom field is used to group customers (like Spare parts group
  // by vendor). Falls back to a flat list if no Brand field exists.
  const brandDef = useMemo(
    () =>
      fieldDefs.find(
        (d) =>
          (d.field_type === "select" || d.field_type === "multi_select") &&
          d.label.trim().toLowerCase() === "brand"
      ),
    [fieldDefs]
  );

  const groups = useMemo(() => {
    if (!brandDef)
      return [{ key: "all", label: null as string | null, items: filtered }];
    const buckets = new Map<string, Customer[]>();
    for (const c of filtered) {
      const v = fieldValues[c.id]?.[brandDef.id];
      const optId = Array.isArray(v) ? v[0] : v;
      const key =
        optId && brandDef.options.some((o) => o.id === optId)
          ? String(optId)
          : "__none";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    const ordered: { key: string; label: string | null; items: Customer[] }[] =
      brandDef.options
        .filter((o) => buckets.has(o.id))
        .map((o) => ({ key: o.id, label: o.label, items: buckets.get(o.id)! }));
    if (buckets.has("__none"))
      ordered.push({
        key: "__none",
        label: t("customers.unspecified"),
        items: buckets.get("__none")!,
      });
    return ordered;
  }, [filtered, brandDef, fieldValues, t]);

  function brandLabel(c: Customer): string {
    if (!brandDef) return "";
    const v = fieldValues[c.id]?.[brandDef.id];
    const opt = brandDef.options.find((o) => o.id === v);
    return opt?.label ?? "";
  }

  const exportRows = initialCustomers.map((c) => ({
    name: c.name,
    city: c.location,
    model: c.machine,
    sn: c.serial_number,
    brand: brandLabel(c),
  }));

  // Expiring warranties: customers whose "Warranty End" date is within 30 days.
  const warrantyDef = useMemo(
    () =>
      fieldDefs.find(
        (d) => d.field_type === "date" && d.label.trim().toLowerCase() === "warranty end"
      ),
    [fieldDefs]
  );
  const expiring = useMemo(() => {
    if (!warrantyDef) return [] as { c: Customer; date: string }[];
    const soon = Date.now() + 30 * 86400000;
    return initialCustomers
      .map((c) => ({ c, date: fieldValues[c.id]?.[warrantyDef.id] as string }))
      .filter(
        (x) =>
          x.date &&
          new Date(`${x.date}T00:00:00`).getTime() <= soon &&
          dueStatus(x.date) !== "overdue"
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [initialCustomers, warrantyDef, fieldValues]);

  const renderCard = (c: Customer) => (
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
      <CustomerTags customerId={c.id} defs={fieldDefs} values={fieldValues} />
      {c.customer_links && c.customer_links.length > 0 && (
        <p className="mt-2 text-xs font-medium text-brand-600">
          {c.customer_links.length} link
          {c.customer_links.length === 1 ? "" : "s"} attached
        </p>
      )}
    </button>
  );

  return (
    <div>
      <PageHeader
        title={t("customers.title")}
        subtitle={`${initialCustomers.length} ${t("common.total")}`}
        action={
          <div className="flex items-center gap-2">
            {editable && (
              <ImportExport
                kind="customers"
                columns={["name", "city", "model", "sn", "brand"]}
                exportRows={exportRows}
              />
            )}
            {editable && (
              <button
                className="btn-primary hidden md:inline-flex"
                onClick={() => setModal({ open: true, customer: null })}
              >
                {t("common.new")}
              </button>
            )}
          </div>
        }
      />

      {editable && (
        <Fab onClick={() => setModal({ open: true, customer: null })} />
      )}

      {expiring.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            {t("customers.warrantyBanner")}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-amber-700">
            {expiring.slice(0, 8).map(({ c, date }) => (
              <button
                key={c.id}
                onClick={() => setModal({ open: true, customer: c })}
                className="underline-offset-2 hover:underline"
              >
                {c.name} · {formatDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        className="input mb-4"
        placeholder={t("customers.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          {t("customers.none")}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              {g.label && (
                <div className="card mb-3 flex items-center gap-2 px-3.5 py-2.5">
                  <h2 className="text-sm font-semibold text-ink">{g.label}</h2>
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-xs font-medium text-ink-muted">
                    {g.items.length}
                  </span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map(renderCard)}
              </div>
            </section>
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
