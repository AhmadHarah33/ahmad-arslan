"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { City, Company, Customer, MachineModel, Profile } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { useRouter } from "next/navigation";
import ImportExport from "@/components/data/import-export";
import Fab from "@/components/fab";
import PageTools from "@/components/page-tools";
import StatCard from "@/components/stat-card";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import { approveCustomer, rejectCustomer } from "@/app/(app)/customers/actions";
import PendingBadge from "@/components/pending-badge";
import CustomerModal from "./customer-modal";

const PAGE_SIZE = 25;

// Fixed dd.mm.yyyy — toLocaleDateString differs between the server and the
// browser, which breaks hydration for anything rendered in the first pass.
function fmtDay(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

// Soft tone pairs (bg / text) used for avatars and brand pills. Picked by
// hashing an id so a customer or brand keeps its colour between visits.
const TONES = [
  "bg-brand-50 text-brand-800",
  "bg-[rgb(var(--tone-done)/0.14)] text-[rgb(var(--tone-done-ink))]",
  "bg-[rgb(var(--tone-warn)/0.16)] text-[rgb(var(--tone-warn-ink))]",
  "bg-[rgb(var(--tone-stuck)/0.14)] text-[rgb(var(--tone-stuck-ink))]",
  "bg-[rgb(var(--tone-neutral)/0.16)] text-[rgb(var(--tone-neutral-ink))]",
];
function toneFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}
function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p[0][0] + (p[1] ? p[1][0] : p[0][1] ?? "")).toUpperCase();
}

export default function CustomersView({
  profile,
  initialCustomers,
  companies,
  cities,
  models,
  brandFilter,
  expiringWarranties,
  brandCounts,
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
  // Customers per brand across the whole list ("__none__" = no brand).
  brandCounts: Record<string, number>;
  initialQuery?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [cityFilter, setCityFilter] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<{ open: boolean; customer: Customer | null }>(
    { open: false, customer: null }
  );
  // Everyone can act now (see the DB migration comment on "customers all
  // authenticated"); a non-manager's change just lands pending review, badged
  // right in this table. Managers additionally get Approve/Reject controls.
  const manager = isManager(profile);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialCustomers.filter((c) => {
      if (cityFilter.size > 0 && !cityFilter.has(c.location)) return false;
      if (!q) return true;
      return [c.name, c.location, c.machine, c.serial_number, c.contact_person, c.company?.name]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, cityFilter, initialCustomers]);

  // "All brands" is still split by brand: sort by brand name (no brand last),
  // then by customer, and a heading is dropped in wherever the brand changes.
  const sorted = useMemo(
    () =>
      filtered.slice().sort((a, b) => {
        const an = a.company?.name ?? "\uffff";
        const bn = b.company?.name ?? "\uffff";
        return an.localeCompare(bn) || a.name.localeCompare(b.name);
      }),
    [filtered]
  );

  // A new search or filter should start from the first page.
  useEffect(() => setPage(0), [query, cityFilter, brandFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

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

  const cityList = useMemo(
    () => Array.from(new Set(initialCustomers.map((c) => c.location).filter(Boolean))).sort(),
    [initialCustomers]
  );
  const brandCount = useMemo(
    () => new Set(initialCustomers.map((c) => c.company_id).filter(Boolean)).size,
    [initialCustomers]
  );

  const topCities = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of initialCustomers) if (c.location) n.set(c.location, (n.get(c.location) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ");
  }, [initialCustomers]);
  const topBrands = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of initialCustomers) if (c.company) n.set(c.company.name, (n.get(c.company.name) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(" · ");
  }, [initialCustomers]);

  function selectBrand(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("brand", id);
    router.push(`/customers${params.toString() ? `?${params}` : ""}`);
  }

  function toggleCity(city: string) {
    setCityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  }

  const brandName =
    brandFilter === "__none__"
      ? t("customers.noBrand")
      : companies.find((c) => c.id === brandFilter)?.name ?? "";
  const activeCount = (brandFilter ? 1 : 0) + cityFilter.size;

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

  function machineLine(c: Customer) {
    if (c.machine) return c.machine;
    const n = c.customer_machines?.length ?? 0;
    return n > 0 ? `${t("customers.machines")}: ${n}` : t("customers.noMachinesYet");
  }

  // Warranty is the customer's In / Out flag (the old Active / Inactive
  // field). In turns amber when one of their machines' warranties ends soon.
  const expiringIds = useMemo(() => new Set(expiring.map((x) => x.c.id)), [expiring]);
  function warrantyOf(c: Customer): { label: string; tone: string } {
    if (c.status !== "active") return { label: t("customers.warrantyOut"), tone: "--tone-neutral" };
    return {
      label: t("customers.warrantyIn"),
      tone: expiringIds.has(c.id) ? "--tone-warn" : "--tone-done",
    };
  }
  const inWarrantyCount = useMemo(
    () => initialCustomers.filter((c) => c.status === "active").length,
    [initialCustomers]
  );
  const brandHeading = (c: Customer) => c.company?.name ?? t("customers.noBrand");

  function callHref(c: Customer) {
    const digits = c.contact_info.replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : null;
  }

  const brandChips: { id: string; label: string }[] = [
    { id: "", label: t("customers.allBrands") },
    ...companies.map((c) => ({ id: c.id, label: c.name })),
    { id: "__none__", label: t("customers.noBrand") },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
            {t("customers.title")}
          </h1>
          <span className="text-[13px] text-ink-muted">{t("customers.subtitle")}</span>
        </div>
        <PageTools />
        <div className="flex items-center gap-2">
          <ImportExport
            kind="customers"
            columns={["name", "city", "model", "sn", "brand"]}
            exportRows={exportRows}
          />
          <button
            className="hidden h-11 items-center gap-2 rounded-xl bg-ink px-[18px] text-sm font-semibold text-surface transition hover:opacity-90 md:inline-flex"
            onClick={() => setModal({ open: true, customer: null })}
          >
            + {t("customers.new")}
          </button>
        </div>
      </div>

      <Fab onClick={() => setModal({ open: true, customer: null })} />

      {/* Stat tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          value={initialCustomers.length}
          label={t("customers.statCustomers")}
          sub={`${initialCustomers.length - inWarrantyCount} ${t("customers.warrantyOut").toLowerCase()}`}
        />
        <StatCard
          value={inWarrantyCount}
          label={t("customers.inWarranty")}
          sub={expiring.length > 0 ? `${expiring.length} ${t("customers.expiringSoon")}` : ""}
          warn={expiring.length > 0}
        />
        <StatCard
          value={cityList.length}
          label={t("customers.statCities")}
          sub={topCities}
        />
        <StatCard
          value={brandCount}
          label={t("customers.statBrands")}
          sub={topBrands}
        />
      </section>

      {expiring.length > 0 && (
        <div
          className="rounded-2xl px-4 py-3"
          style={{ background: "rgb(var(--tone-warn) / 0.14)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "rgb(var(--tone-warn-ink))" }}>
            {t("customers.warrantyBanner")}
          </p>
          <div
            className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm"
            style={{ color: "rgb(var(--tone-warn-ink))" }}
          >
            {expiring.slice(0, 8).map(({ c, date }) => (
              <button
                key={c.id}
                onClick={() => setModal({ open: true, customer: c })}
                className="underline-offset-2 hover:underline"
              >
                {c.name} · {fmtDay(date)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + brand filter */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-0 flex-1 basis-[320px] items-center gap-2.5 rounded-[14px] bg-surface px-4 text-ink-faint">
          <SearchIcon className="h-[17px] w-[17px] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
            aria-label={t("customers.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </label>

        {/* Brand chips (desktop) — the same single-brand filter the sidebar
            tree drives, kept in the URL. */}
        <div role="tablist" className="seg hidden max-w-full flex-wrap md:inline-flex">
          {brandChips.map((b) => {
            const n =
              b.id === ""
                ? Object.values(brandCounts).reduce((x, y) => x + y, 0)
                : brandCounts[b.id] ?? 0;
            const on = brandFilter === b.id;
            return (
              <button
                key={b.id || "all"}
                role="tab"
                aria-selected={on}
                onClick={() => selectBrand(b.id)}
                className={`seg-btn whitespace-nowrap ${on ? "seg-btn-on" : ""}`}
              >
                {b.label}
                <span className="text-xs font-normal text-ink-faint">{n}</span>
              </button>
            );
          })}
        </div>

        {/* Filter button (phone) */}
        <button
          aria-label={t("customers.filters")}
          aria-haspopup="dialog"
          onClick={() => setSheet(true)}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] md:hidden ${
            activeCount > 0 ? "bg-brand-800 text-white" : "bg-surface text-ink"
          }`}
        >
          <FilterIcon className="h-[18px] w-[18px]" />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[rgb(var(--canvas))] bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips (phone) */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 md:hidden">
          {brandFilter && (
            <button
              onClick={() => selectBrand("")}
              className="flex h-[34px] items-center gap-1.5 rounded-full bg-brand-800 pl-3 pr-2 text-xs font-medium text-white"
            >
              {brandName} <span aria-hidden="true" className="text-sm text-brand-200">×</span>
            </button>
          )}
          {Array.from(cityFilter).map((c) => (
            <button
              key={c}
              onClick={() => toggleCity(c)}
              className="flex h-[34px] items-center gap-1.5 rounded-full bg-brand-800 pl-3 pr-2 text-xs font-medium text-white"
            >
              {c} <span aria-hidden="true" className="text-sm text-brand-200">×</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-[22px] bg-surface px-5 py-10 text-center text-sm text-ink-muted">
          {t("customers.none")}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <section
            aria-label={t("customers.title")}
            className="hidden overflow-hidden rounded-[22px] bg-surface md:block"
          >
            <div className="overflow-x-auto">
              <div className="min-w-[1050px]">
                <div className={`${ROW} border-b border-surface-border py-3.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted`}>
                  <span>{t("customers.colCustomer")}</span>
                  <span>{t("customers.city")}</span>
                  <span>{t("customers.brand")}</span>
                  <span>{t("customers.sn")}</span>
                  <span>{t("customers.colContact")}</span>
                  <span>{t("customers.colWarranty")}</span>
                  <span />
                </div>
                {shown.map((c, i) => (
                  <Fragment key={c.id}>
                    {(i === 0 || brandHeading(shown[i - 1]) !== brandHeading(c)) && (
                      <div className="flex items-center gap-2.5 border-b border-surface-border bg-surface-soft/70 px-5 py-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink">{brandHeading(c)}</span>
                        <span className="rounded-full bg-surface px-2 py-px text-[11px] font-semibold text-ink-muted">
                          {sorted.filter((x) => brandHeading(x) === brandHeading(c)).length}
                        </span>
                      </div>
                    )}
                  <div
                    key={c.id}
                    onClick={() => setModal({ open: true, customer: c })}
                    className={`${ROW} cursor-pointer border-b border-surface-border py-2.5 transition hover:bg-surface-soft`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-surface-soft text-xs font-bold text-ink-muted"
                      >
                        {initials(c.name)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                        <span className="truncate text-xs text-ink-muted">{machineLine(c)}</span>
                      </div>
                    </div>
                    <span className="truncate text-[13px] text-ink">{c.location || "—"}</span>
                    <span>
                      {c.company ? (
                        <span
                          className={`inline-block max-w-full truncate rounded-lg px-2.5 py-[3px] text-[11px] font-semibold ${toneFor(c.company.id)}`}
                        >
                          {c.company.name}
                        </span>
                      ) : (
                        <span className="text-[13px] text-ink-faint">—</span>
                      )}
                    </span>
                    <span className="truncate font-mono text-xs text-ink-muted" title={c.serial_number}>
                      {c.serial_number || "—"}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium text-ink">
                        {c.contact_person || "—"}
                      </span>
                      <span className="truncate text-xs text-ink-muted">{c.contact_info}</span>
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-0.5">
                      {!c.is_approved ? (
                        <PendingBadge action={c.pending_action} />
                      ) : (
                        <WarrantyPill label={warrantyOf(c).label} tone={warrantyOf(c).tone} />
                      )}
                    </div>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {!c.is_approved && manager ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => approve(c.id)} className="btn-primary h-8 px-2.5 text-xs">
                            {t("approval.approve")}
                          </button>
                          <button onClick={() => reject(c)} className="btn-ghost h-8 px-2.5 text-xs">
                            {t("approval.reject")}
                          </button>
                        </div>
                      ) : (
                        <button
                          aria-label={t("common.edit")}
                          onClick={() => setModal({ open: true, customer: c })}
                          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface-soft text-ink-muted transition hover:text-ink"
                        >
                          <PencilIcon className="h-[15px] w-[15px]" />
                        </button>
                      )}
                    </div>
                  </div>
                  </Fragment>
                ))}
                <div className="flex items-center justify-between px-5 py-3.5 text-xs text-ink-muted">
                  <span>
                    {t("pg.showing")} {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + shown.length} {t("pg.of")} {filtered.length}
                  </span>
                  {pageCount > 1 && (
                    <div className="flex gap-1.5">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        className="h-[34px] rounded-[10px] bg-surface-soft px-3 text-xs text-ink disabled:opacity-40"
                      >
                        {t("pg.prev")}
                      </button>
                      <button
                        disabled={page >= pageCount - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="h-[34px] rounded-[10px] bg-ink px-3 text-xs text-surface disabled:opacity-40"
                      >
                        {t("pg.next")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Phone cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {shown.map((c, i) => {
              const tel = callHref(c);
              return (
                <Fragment key={c.id}>
                {(i === 0 || brandHeading(shown[i - 1]) !== brandHeading(c)) && (
                  <span className="px-1.5 pt-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {brandHeading(c)}
                  </span>
                )}
                <article
                  onClick={() => setModal({ open: true, customer: c })}
                  className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-surface p-3.5"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-soft text-[13px] font-bold text-ink-muted"
                  >
                    {initials(c.name)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
                      {c.company && (
                        <span className={`shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold ${toneFor(c.company.id)}`}>
                          {c.company.name}
                        </span>
                      )}
                      <span className="truncate">
                        {[c.machine, c.location].filter(Boolean).join(" · ") || machineLine(c)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 truncate text-xs text-ink-muted">
                      {c.contact_person}
                      {!c.is_approved && <PendingBadge action={c.pending_action} />}
                    </span>
                  </div>
                  {tel && (
                    <a
                      href={tel}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${t("customers.call")} ${c.contact_person || c.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[rgb(var(--tone-done)/0.14)] text-[rgb(var(--tone-done-ink))]"
                    >
                      <PhoneIcon className="h-[18px] w-[18px]" />
                    </a>
                  )}
                </article>
                </Fragment>
              );
            })}
            {pageCount > 1 && (
              <div className="flex items-center justify-between pt-1 text-xs text-ink-muted">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-10 rounded-xl bg-surface px-4 text-ink disabled:opacity-40"
                >
                  {t("pg.prev")}
                </button>
                <span>
                  {page + 1} / {pageCount}
                </span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-10 rounded-xl bg-ink px-4 text-surface disabled:opacity-40"
                >
                  {t("pg.next")}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {sheet && (
        <FilterSheet
          title={t("customers.filterTitle")}
          resetLabel={t("customers.reset")}
          applyLabel={`${t("customers.showResults")} (${filtered.length})`}
          brandLabel={t("customers.brand")}
          cityLabel={t("customers.city")}
          brandFilter={brandFilter}
          brandChips={brandChips.filter((b) => b.id !== "")}
          onBrand={(id) => selectBrand(id === brandFilter ? "" : id)}
          cities={cityList}
          cityFilter={cityFilter}
          onCity={toggleCity}
          onReset={() => {
            setCityFilter(new Set());
            if (brandFilter) selectBrand("");
          }}
          onClose={() => setSheet(false)}
        />
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
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

const ROW =
  "grid grid-cols-[minmax(240px,1.6fr)_110px_120px_130px_minmax(200px,1.3fr)_100px_100px] items-center gap-3.5 px-5";

function WarrantyPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
      style={{ background: `rgb(var(${tone}) / 0.14)`, color: `rgb(var(${tone}-ink))` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(var(${tone}-ink))` }} />
      {label}
    </span>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const v = active ? "--tone-done" : "--tone-neutral";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
      style={{ background: `rgb(var(${v}) / 0.14)`, color: `rgb(var(${v}-ink))` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(var(${v}-ink))` }} />
      {label}
    </span>
  );
}

// Phone filter sheet: brand (one at a time — it is the URL filter the sidebar
// uses) and cities (any number).
function FilterSheet({
  title,
  resetLabel,
  applyLabel,
  brandLabel,
  cityLabel,
  brandFilter,
  brandChips,
  onBrand,
  cities,
  cityFilter,
  onCity,
  onReset,
  onClose,
}: {
  title: string;
  resetLabel: string;
  applyLabel: string;
  brandLabel: string;
  cityLabel: string;
  brandFilter: string;
  brandChips: { id: string; label: string }[];
  onBrand: (id: string) => void;
  cities: string[];
  cityFilter: Set<string>;
  onCity: (c: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:hidden">
      <div className="animate-overlay absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-window relative z-10 flex max-h-[80vh] w-full flex-col rounded-t-[26px] bg-surface"
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between px-5 pb-1">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button onClick={onReset} className="h-11 px-1 text-[13px] font-medium text-ink-muted">
            {resetLabel}
          </button>
        </div>
        <div className="flex flex-col gap-[18px] overflow-y-auto px-5 pb-4 pt-1.5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-muted">{brandLabel}</span>
            <div className="grid grid-cols-2 gap-2">
              {brandChips.map((b) => {
                const on = brandFilter === b.id;
                return (
                  <button
                    key={b.id}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onBrand(b.id)}
                    className={`flex h-[46px] items-center gap-2 rounded-[13px] border px-3 text-left text-[13px] font-medium ${
                      on ? "border-brand-800 bg-brand-50 text-brand-800" : "border-surface-border text-ink"
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] text-[11px] text-white ${
                        on ? "border-brand-800 bg-brand-800" : "border-surface-border"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate">{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {cities.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-muted">{cityLabel}</span>
              <div className="flex flex-wrap gap-1.5">
                {cities.map((c) => {
                  const on = cityFilter.has(c);
                  return (
                    <button
                      key={c}
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => onCity(c)}
                      className={`h-10 rounded-full border px-3.5 text-[12.5px] font-medium ${
                        on ? "border-brand-800 bg-brand-800 text-white" : "border-surface-border text-ink"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div
          className="border-t border-surface-border px-5 pt-3"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={onClose}
            className="h-[52px] w-full rounded-2xl bg-brand-800 text-sm font-semibold text-white"
          >
            {applyLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

/* --- inline icons --- */
function SearchIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
function FilterIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
function PencilIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}
function PhoneIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}
