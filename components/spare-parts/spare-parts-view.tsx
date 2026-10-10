"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Company, Profile, SparePart } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { saveCompany } from "@/app/(app)/spare-parts/actions";
import { approveSparePart, rejectSparePart } from "@/app/(app)/spare-parts/actions";
import { deleteBrand } from "@/app/(app)/catalog/actions";
import Modal from "@/components/modal";
import ImportExport from "@/components/data/import-export";
import Fab from "@/components/fab";
import PageTools from "@/components/page-tools";
import StatCard from "@/components/stat-card";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import PendingBadge from "@/components/pending-badge";
import { photoUrl } from "@/lib/storage";
import { formatAmount } from "@/lib/money";
import PhotoLightbox from "./photo-lightbox";
import PartModal from "./part-modal";
import { useAction } from "@/lib/use-action";
import { compareNames } from "@/lib/sort";

type Stock = "ok" | "low" | "neg";
type Sort = "company" | "qty" | "price" | "name";

// Below zero = the count went negative (parts were used faster than they were
// recorded in), which is its own "go and recount" state, not just "low".
function stockOf(p: SparePart): Stock {
  if (p.quantity < 0) return "neg";
  if ((p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0)) return "low";
  return "ok";
}

const STOCK_VAR: Record<Stock, string> = {
  ok: "--tone-done",
  low: "--tone-warn",
  neg: "--tone-stuck",
};

// Small square preview in the row. Clicking it zooms rather than opening the
// row, so `stopPropagation` — the whole row is a click target. A part with no
// photo keeps the same footprint so the name column stays aligned.
function Thumbnail({
  part,
  onZoom,
  size = 44,
}: {
  part: SparePart;
  onZoom: () => void;
  size?: number;
}) {
  const first = part.spare_part_photos?.[0];
  const extra = (part.spare_part_photos?.length ?? 0) - 1;
  const box = { width: size, height: size };

  if (!first) {
    return (
      <div
        style={box}
        className="flex shrink-0 items-center justify-center rounded-xl bg-surface-soft text-ink-faint"
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onZoom();
      }}
      style={box}
      aria-label={`${part.name} — photo`}
      className="relative block shrink-0 overflow-hidden rounded-xl transition hover:ring-2 hover:ring-brand-400"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl(first.storage_path)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
      {extra > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-ink/70 px-1 text-[10px] font-medium leading-tight text-white">
          +{extra}
        </span>
      )}
    </button>
  );
}

export default function SparePartsView({
  profile,
  companies,
  parts,
  brandFilter,
  initialQuery = "",
}: {
  profile: Profile;
  companies: Company[];
  parts: SparePart[];
  brandFilter: string;
  initialQuery?: string;
}) {
  const t = useT();
  const router = useRouter();
  const manager = isManager(profile);
  const [query, setQuery] = useState(initialQuery);
  const [stockFilter, setStockFilter] = useState<Set<Stock>>(() => new Set());
  const [sort, setSort] = useState<Sort>("company");
  const [sheet, setSheet] = useState(false);
  const [companyModal, setCompanyModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const { run: submitCompany, pending: savingCompany } = useAction(saveCompany, {
    onSuccess: () => {
      setCompanyName("");
      setCompanyModal(false);
      router.refresh();
    },
  });
  const [partModal, setPartModal] = useState<{ open: boolean; part: SparePart | null }>(
    { open: false, part: null }
  );
  // Photo blown up from the row thumbnail. Separate from partModal so a
  // quick visual check never drags the whole edit form open.
  const [lightbox, setLightbox] = useState<SparePart | null>(null);

  const counts = useMemo(() => {
    const c: Record<Stock, number> = { ok: 0, low: 0, neg: 0 };
    for (const p of parts) c[stockOf(p)]++;
    return c;
  }, [parts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parts.filter((p) => {
      if (stockFilter.size > 0 && !stockFilter.has(stockOf(p))) return false;
      if (!q) return true;
      return [p.name, p.part_number, p.notes, p.company?.name]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, parts, stockFilter]);

  // Parts are grouped under a brand heading. Any other sort flattens them into
  // one ordered list instead.
  const groups = useMemo(() => {
    if (sort !== "company") {
      const rows = filtered.slice().sort((a, b) => {
        if (sort === "qty") return a.quantity - b.quantity;
        if (sort === "price") return (b.price ?? 0) - (a.price ?? 0);
        return compareNames(a.name, b.name);
      });
      return rows.length ? [{ id: "__flat__", name: "", rows }] : [];
    }
    const byBrand = new Map<string, { id: string; name: string; rows: SparePart[] }>();
    for (const p of filtered) {
      const id = p.company_id ?? "__none__";
      if (!byBrand.has(id)) {
        byBrand.set(id, { id, name: p.company?.name ?? t("customers.noBrand"), rows: [] });
      }
      byBrand.get(id)!.rows.push(p);
    }
    return [...byBrand.values()].sort((a, b) => compareNames(a.name, b.name));
  }, [filtered, sort, t]);

  const lowNames = useMemo(
    () =>
      parts
        .filter((p) => stockOf(p) === "low")
        .slice(0, 2)
        .map((p) => p.name)
        .join(" · "),
    [parts]
  );

  function addCompany() {
    if (!companyName.trim()) return;
    submitCompany(null, companyName);
  }

  function selectBrand(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("brand", id);
    router.push(`/spare-parts${params.toString() ? `?${params}` : ""}`);
  }

  function toggleStock(s: Stock) {
    setStockFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const [deletingBrand, setDeletingBrand] = useState(false);
  async function removeBrand(id: string) {
    if (!confirm(t("catalog.confirmDeleteBrand"))) return;
    setDeletingBrand(true);
    const res = await deleteBrand(id);
    setDeletingBrand(false);
    if (res?.error) return toastErr(res.error);
    selectBrand("");
    router.refresh();
  }

  async function approve(id: string) {
    const res = await approveSparePart(id);
    if (res?.error) return toastErr(res.error);
    router.refresh();
  }

  async function reject(p: SparePart) {
    const key =
      p.pending_action === "delete"
        ? "approval.rejectConfirmDelete"
        : p.pending_action === "insert"
        ? "approval.rejectConfirmInsert"
        : "approval.rejectConfirm";
    if (!confirm(t(key))) return;
    const res = await rejectSparePart(p.id);
    if (res?.error) return toastErr(res.error);
    router.refresh();
  }

  const stockLabel = (s: Stock) =>
    t(s === "ok" ? "parts.inStock" : s === "low" ? "parts.lowStock" : "parts.belowZero");

  function StockPill({ p }: { p: SparePart }) {
    if (!p.is_approved) return <PendingBadge action={p.pending_action} />;
    const s = stockOf(p);
    return (
      <span
        className="text-[13px] font-semibold"
        style={{ color: `rgb(var(${STOCK_VAR[s]}-ink))` }}
      >
        {stockLabel(s)}
      </span>
    );
  }

  const activeCount = (brandFilter ? 1 : 0) + stockFilter.size + (sort !== "company" ? 1 : 0);
  const brandName = companies.find((c) => c.id === brandFilter)?.name ?? "";
  const sortLabel: Record<Sort, string> = {
    company: t("parts.sortCompany"),
    qty: t("parts.sortQty"),
    price: t("parts.sortPrice"),
    name: t("parts.sortName"),
  };

  const stockChips: { id: "" | Stock; label: string }[] = [
    { id: "", label: t("parts.allParts") },
    { id: "ok", label: t("parts.inStock") },
    { id: "low", label: t("parts.lowStock") },
    { id: "neg", label: t("parts.belowZero") },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
            {t("parts.title")}
          </h1>
          <span className="text-[13px] text-ink-muted">{t("parts.subtitle")}</span>
        </div>
        <PageTools />
        <div className="flex items-center gap-2">
          <ImportExport
            kind="parts"
            columns={["company", "name", "part_number", "quantity", "price"]}
            exportRows={parts.map((p) => ({
              company: p.company?.name ?? "",
              name: p.name,
              part_number: p.part_number,
              quantity: p.quantity,
              price: p.price ?? "",
            }))}
          />
          <button
            className="hidden h-11 items-center rounded-xl bg-surface px-4 text-sm font-medium text-ink transition hover:opacity-80 md:inline-flex"
            onClick={() => setCompanyModal(true)}
          >
            {t("parts.newCompany")}
          </button>
          {/* The FAB below is md:hidden, so without this there was no way to
              add a spare part from a desktop browser. */}
          <button
            className="hidden h-11 items-center rounded-xl bg-ink px-[18px] text-sm font-semibold text-surface transition hover:opacity-90 md:inline-flex"
            onClick={() => setPartModal({ open: true, part: null })}
          >
            + {t("parts.newPart")}
          </button>
        </div>
      </div>

      <Fab onClick={() => setPartModal({ open: true, part: null })} />

      {/* Stat tiles. The three stock tiles double as the stock filter. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          value={parts.length}
          label={t("parts.statParts")}
          sub={`${companies.length} ${t("parts.companies")}`}
          active={stockFilter.size === 0 ? undefined : false}
          onClick={() => setStockFilter(new Set())}
        />
        {(["ok", "low", "neg"] as Stock[]).map((s) => (
          <StatCard
            key={s}
            value={counts[s]}
            label={stockLabel(s)}
            tone={STOCK_VAR[s]}
            sub={
              s === "ok"
                ? `${parts.length ? Math.round((counts.ok / parts.length) * 100) : 0}% ${t("parts.ofParts")}`
                : s === "low"
                ? lowNames
                : counts.neg > 0
                ? t("parts.recountNeeded")
                : ""
            }
            active={stockFilter.has(s)}
            onClick={() => toggleStock(s)}
          />
        ))}
      </section>

      {/* Search + stock chips */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-12 min-w-0 flex-1 basis-[280px] items-center gap-2.5 rounded-[14px] bg-surface px-4 text-ink-faint">
          <SearchIcon className="h-[17px] w-[17px] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("parts.searchPlaceholder")}
            aria-label={t("parts.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </label>

        <div role="tablist" className="seg hidden max-w-full flex-wrap md:inline-flex">
          {stockChips.map((c) => {
            const on = c.id === "" ? stockFilter.size === 0 : stockFilter.size === 1 && stockFilter.has(c.id);
            const n = c.id === "" ? parts.length : counts[c.id];
            return (
              <button
                key={c.id || "all"}
                role="tab"
                aria-selected={on}
                onClick={() => setStockFilter(c.id === "" ? new Set() : new Set([c.id]))}
                className={`seg-btn whitespace-nowrap ${on ? "seg-btn-on" : ""}`}
              >
                {c.label}
                <span className="text-xs font-normal text-ink-faint">{n}</span>
              </button>
            );
          })}
        </div>

        {/* Brand filter — mirrors the sidebar's brand tree. */}
        <select
          className="hidden h-10 rounded-full border-0 bg-surface px-3.5 text-[13px] font-medium text-ink outline-none md:block"
          value={brandFilter}
          aria-label={t("parts.company")}
          onChange={(e) => selectBrand(e.target.value)}
        >
          <option value="">{t("parts.allCompanies")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {manager && brandFilter && (
          <button
            className="hidden h-10 shrink-0 rounded-full bg-surface px-3.5 text-[13px] font-medium md:block"
            style={{ color: "rgb(var(--tone-stuck-ink))" }}
            onClick={() => removeBrand(brandFilter)}
            disabled={deletingBrand}
          >
            {t("parts.deleteCompany")}
          </button>
        )}

        {/* Filter & sort (phone) */}
        <button
          aria-label={t("parts.filterSort")}
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
            <Chip label={brandName} onRemove={() => selectBrand("")} />
          )}
          {Array.from(stockFilter).map((s) => (
            <Chip key={s} label={stockLabel(s)} onRemove={() => toggleStock(s)} />
          ))}
          {sort !== "company" && (
            <Chip label={sortLabel[sort]} onRemove={() => setSort("company")} />
          )}
        </div>
      )}

      {companies.length === 0 ? (
        <div className="rounded-[22px] bg-surface px-5 py-10 text-center text-sm text-ink-muted">
          {t("parts.noCompanies")} {t("parts.startInventory")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[22px] bg-surface px-5 py-10 text-center text-sm text-ink-muted">
          {t("parts.noPartsHere")}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <section
            aria-label={t("parts.title")}
            className="hidden overflow-hidden rounded-[22px] bg-surface md:block"
          >
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className={`${ROW} border-b border-surface-border py-3.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted`}>
                  <span />
                  <span>{t("parts.partNumber")}</span>
                  <span>{t("parts.partName")}</span>
                  <span className="text-center">{t("parts.quantity")}</span>
                  <span>{t("parts.price")}</span>
                  <span>{t("task.status")}</span>
                  <span />
                </div>
                {groups.map((g) => (
                  <Fragment key={g.id}>
                    {g.name && (
                      <div className="flex items-center gap-2.5 border-b border-surface-border bg-surface-soft/70 px-5 py-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink">
                          {g.name}
                        </span>
                        <span className="rounded-full bg-surface px-2 py-px text-[11px] font-semibold text-ink-muted">
                          {g.rows.length}
                        </span>
                        {manager && g.id !== "__none__" && (
                          <button
                            onClick={() => removeBrand(g.id)}
                            disabled={deletingBrand}
                            className="ml-auto text-xs hover:underline"
                            style={{ color: "rgb(var(--tone-stuck-ink))" }}
                          >
                            {t("parts.deleteCompany")}
                          </button>
                        )}
                      </div>
                    )}
                    {g.rows.map((p) => {
                      const s = stockOf(p);
                      return (
                        <div
                          key={p.id}
                          onClick={() => setPartModal({ open: true, part: p })}
                          className={`${ROW} cursor-pointer border-b border-surface-border py-2.5 transition hover:bg-surface-soft`}
                        >
                          <Thumbnail part={p} onZoom={() => setLightbox(p)} />
                          <span className="truncate text-[13px] font-semibold text-brand-600">
                            {p.part_number || "—"}
                          </span>
                          <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                          <span className="text-center text-[15px] font-bold tabular-nums text-ink">{p.quantity}</span>
                          <span className="text-sm text-ink-muted">{formatAmount(p.price)}</span>
                          <span>
                            <StockPill p={p} />
                          </span>
                          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                            {!p.is_approved && manager ? (
                              <div className="flex gap-1.5">
                                <button onClick={() => approve(p.id)} className="btn-primary h-8 px-2.5 text-xs">
                                  {t("approval.approve")}
                                </button>
                                <button onClick={() => reject(p)} className="btn-ghost h-8 px-2.5 text-xs">
                                  {t("approval.reject")}
                                </button>
                              </div>
                            ) : (
                              <button
                                aria-label={t("common.edit")}
                                onClick={() => setPartModal({ open: true, part: p })}
                                className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface-soft text-ink-muted transition hover:text-ink"
                              >
                                <PencilIcon className="h-[15px] w-[15px]" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* Phone: grouped cards */}
          <div className="flex flex-col gap-3.5 md:hidden">
            {groups.map((g) => (
              <section key={g.id} className="flex flex-col gap-2">
                {g.name ? (
                  <span className="px-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {g.name} · {g.rows.length}
                  </span>
                ) : (
                  <span className="px-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {sortLabel[sort]} · {g.rows.length}
                  </span>
                )}
                <div className="overflow-hidden rounded-[20px] bg-surface">
                  {g.rows.map((p) => {
                    const s = stockOf(p);
                    return (
                      <div
                        key={p.id}
                        onClick={() => setPartModal({ open: true, part: p })}
                        className="flex cursor-pointer items-center gap-3 border-b border-surface-border px-3.5 py-3 last:border-b-0"
                      >
                        <Thumbnail part={p} onZoom={() => setLightbox(p)} size={46} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                          <span className="truncate text-xs text-ink-muted">
                            {[p.part_number, sort !== "company" ? p.company?.name : "", p.price != null ? formatAmount(p.price) : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <span className="text-xl font-bold leading-tight text-ink">
                            {p.quantity}
                          </span>
                          {p.is_approved ? (
                            <span
                              className="text-[10px] font-semibold"
                              style={{ color: `rgb(var(${STOCK_VAR[s]}-ink))` }}
                            >
                              {stockLabel(s)}
                            </span>
                          ) : (
                            <PendingBadge action={p.pending_action} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {sheet && (
        <FilterSheet
          t={t}
          companies={companies}
          brandFilter={brandFilter}
          onBrand={(id) => selectBrand(id === brandFilter ? "" : id)}
          stockFilter={stockFilter}
          onStock={toggleStock}
          stockLabel={stockLabel}
          sort={sort}
          sortLabel={sortLabel}
          onSort={setSort}
          applyLabel={`${t("parts.showParts")} (${filtered.length})`}
          onReset={() => {
            setStockFilter(new Set());
            setSort("company");
            if (brandFilter) selectBrand("");
          }}
          onClose={() => setSheet(false)}
        />
      )}

      {companyModal && (
        <Modal title={t("parts.newCompany")} onClose={() => setCompanyModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">{t("parts.companyName")}</label>
              <input
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("parts.companyPlaceholder")}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCompanyModal(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn-primary" onClick={addCompany} disabled={savingCompany}>
                {savingCompany ? t("common.saving") : t("common.add")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.spare_part_photos ?? []}
          title={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      {partModal.open && (
        <PartModal
          profile={profile}
          companies={companies}
          part={partModal.part}
          onClose={() => setPartModal({ open: false, part: null })}
          onChanged={() => {
            setPartModal({ open: false, part: null });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const ROW =
  "grid grid-cols-[52px_130px_minmax(220px,1fr)_150px_150px_170px_90px] items-center gap-x-8 px-5";

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="flex h-[34px] items-center gap-1.5 rounded-full bg-brand-800 pl-3 pr-2 text-xs font-medium text-white"
    >
      {label} <span aria-hidden="true" className="text-sm text-brand-200">×</span>
    </button>
  );
}

function FilterSheet({
  t,
  companies,
  brandFilter,
  onBrand,
  stockFilter,
  onStock,
  stockLabel,
  sort,
  sortLabel,
  onSort,
  applyLabel,
  onReset,
  onClose,
}: {
  t: ReturnType<typeof useT>;
  companies: Company[];
  brandFilter: string;
  onBrand: (id: string) => void;
  stockFilter: Set<Stock>;
  onStock: (s: Stock) => void;
  stockLabel: (s: Stock) => string;
  sort: Sort;
  sortLabel: Record<Sort, string>;
  onSort: (s: Sort) => void;
  applyLabel: string;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:hidden">
      <div className="animate-overlay absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("parts.filterSort")}
        className="animate-window relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-[26px] bg-surface"
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between px-5 pb-1">
          <h2 className="text-[17px] font-semibold text-ink">{t("parts.filterSort")}</h2>
          <button onClick={onReset} className="h-11 px-1 text-[13px] font-medium text-ink-muted">
            {t("customers.reset")}
          </button>
        </div>
        <div className="flex flex-col gap-[18px] overflow-y-auto px-5 pb-4 pt-1.5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-muted">{t("parts.company")}</span>
            <div className="grid grid-cols-2 gap-2">
              {companies.map((c) => {
                const on = brandFilter === c.id;
                return (
                  <button
                    key={c.id}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onBrand(c.id)}
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
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-muted">{t("parts.stock")}</span>
            <div className="flex flex-wrap gap-1.5">
              {(["ok", "low", "neg"] as Stock[]).map((s) => {
                const on = stockFilter.has(s);
                return (
                  <button
                    key={s}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => onStock(s)}
                    className={`flex h-10 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium ${
                      on ? "border-brand-800 bg-brand-50 text-brand-800" : "border-surface-border text-ink"
                    }`}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: `rgb(var(${STOCK_VAR[s]}))` }} />
                    {stockLabel(s)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-muted">{t("parts.sortBy")}</span>
            <div role="radiogroup" className="flex flex-col overflow-hidden rounded-[14px] border border-surface-border">
              {(Object.keys(sortLabel) as Sort[]).map((k) => {
                const on = sort === k;
                return (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={on}
                    onClick={() => onSort(k)}
                    className="flex min-h-[46px] items-center border-b border-surface-border px-3.5 text-left text-[13.5px] text-ink last:border-b-0"
                  >
                    <span className="flex-1">{sortLabel[k]}</span>
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] ${
                        on ? "border-brand-800" : "border-surface-border"
                      }`}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-brand-800" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
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
function ImageIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}
