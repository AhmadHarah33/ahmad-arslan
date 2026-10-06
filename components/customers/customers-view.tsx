"use client";

import { useMemo, useState } from "react";
import type { City, Company, Customer, MachineModel, Profile } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import ImportExport from "@/components/data/import-export";
import { formatDate } from "@/lib/dates";
import Fab from "@/components/fab";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import { approveCustomer, deleteCustomer, rejectCustomer } from "@/app/(app)/customers/actions";
import PendingBadge from "@/components/pending-badge";
import CustomerModal from "./customer-modal";

export default function CustomersView({
  profile,
  initialCustomers,
  companies,
  cities,
  models,
  brandFilter,
  expiringWarranties,
  initialQuery = "",
}: {
  profile: Profile;
  initialCustomers: Customer[];
  companies: Company[];
  cities: City[];
  models: MachineModel[];
  brandFilter: string;
  // Customers with a machine whose warranty ends within 30 days (soonest first).
  expiringWarranties: { customer_id: string; date: string }[];
  initialQuery?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [modal, setModal] = useState<{ open: boolean; customer: Customer | null }>(
    { open: false, customer: null }
  );
  // Everyone can act now (see the DB migration comment on "customers all
  // authenticated"); a non-manager's change just lands pending review, badged
  // right in this table. Managers additionally get Approve/Reject controls.
  const manager = isManager(profile);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialCustomers;
    return initialCustomers.filter((c) =>
      [c.name, c.location, c.machine, c.serial_number, c.contact_person, c.company?.name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, initialCustomers]);

  const exportRows = initialCustomers.map((c) => ({
    name: c.name,
    city: c.location,
    model: c.machine,
    sn: c.serial_number,
    brand: c.company?.name ?? "",
  }));

  // Expiring warranties: customers with a machine whose warranty (factory date
  // or agreement extension) ends within 30 days. Computed on the server.
  const expiring = useMemo(() => {
    const byId = new Map(initialCustomers.map((c) => [c.id, c]));
    return expiringWarranties
      .map((w) => ({ c: byId.get(w.customer_id), date: w.date }))
      .filter((x): x is { c: Customer; date: string } => !!x.c);
  }, [initialCustomers, expiringWarranties]);

  function selectBrand(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("brand", id);
    router.push(`/customers${params.toString() ? `?${params}` : ""}`);
  }

  async function approve(id: string) {
    const res = await approveCustomer(id);
    if (res?.error) return toastErr(res.error);
    router.refresh();
  }

  async function reject(c: Customer) {
    const key =
      c.pending_action === "delete"
        ? "approval.rejectConfirmDelete"
        : c.pending_action === "insert"
        ? "approval.rejectConfirmInsert"
        : "approval.rejectConfirm";
    if (!confirm(t(key))) return;
    const res = await rejectCustomer(c.id);
    if (res?.error) return toastErr(res.error);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(t("customers.confirmDelete"))) return;
    const res = await deleteCustomer(id);
    if (res?.error) return toastErr(res.error);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("customers.title")}
        subtitle={`${initialCustomers.length} ${t("common.total")}`}
        action={
          <div className="flex items-center gap-2">
            <ImportExport
              kind="customers"
              columns={["name", "city", "model", "sn", "brand"]}
              exportRows={exportRows}
            />
            <button
              className="btn-primary hidden md:inline-flex"
              onClick={() => setModal({ open: true, customer: null })}
            >
              {t("common.new")}
            </button>
          </div>
        }
      />

      <Fab onClick={() => setModal({ open: true, customer: null })} />

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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder={t("customers.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {/* Mirrors the sidebar's brand tree — the sidebar is desktop-only, so
            this is how a brand gets picked on a phone (and a quick jump on
            desktop too). */}
        <select
          className="input sm:w-56"
          value={brandFilter}
          onChange={(e) => selectBrand(e.target.value)}
        >
          <option value="">{t("customers.allCustomers")}</option>
          <option value="__none__">{t("customers.noBrand")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          {t("customers.none")}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">{t("customers.name")}</th>
                <th className="px-4 py-3">{t("customers.brand")}</th>
                <th className="px-4 py-3">{t("customers.contactPerson")}</th>
                <th className="px-4 py-3">{t("customers.contactInfo")}</th>
                <th className="px-4 py-3">{t("task.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setModal({ open: true, customer: c })}
                  className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-soft"
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {c.name}
                    {c.location && (
                      <span className="ml-2 text-xs font-normal text-ink-faint">
                        {c.location}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.company?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.contact_person || "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.contact_info || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.is_approved ? (
                      <span className={`chip ${c.status === "active" ? "tone-done" : "tone-neutral"}`}>
                        {t(c.status === "active" ? "customers.active" : "customers.inactive")}
                      </span>
                    ) : (
                      <PendingBadge action={c.pending_action} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!c.is_approved && manager ? (
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => approve(c.id)}
                          className="btn-primary h-7 px-2.5 text-xs"
                        >
                          {t("approval.approve")}
                        </button>
                        <button
                          onClick={() => reject(c)}
                          className="btn-ghost h-7 px-2.5 text-xs"
                        >
                          {t("approval.reject")}
                        </button>
                      </div>
                    ) : manager ? (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-ink-faint">{t("common.edit")}</span>
                        <button
                          onClick={() => remove(c.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint">{t("common.edit")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && (
        <CustomerModal
          profile={profile}
          companies={companies}
          cities={cities}
          models={models}
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
