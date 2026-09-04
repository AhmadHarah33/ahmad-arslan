"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Company, Profile, SparePart } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { saveCompany } from "@/app/(app)/spare-parts/actions";
import { approveSparePart, rejectSparePart } from "@/app/(app)/spare-parts/actions";
import Modal from "@/components/modal";
import ImportExport from "@/components/data/import-export";
import Fab from "@/components/fab";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";
import PendingBadge from "@/components/pending-badge";
import { photoUrl } from "@/lib/storage";
import PhotoLightbox from "./photo-lightbox";
import PartModal from "./part-modal";
import { useAction } from "@/lib/use-action";

// Small square preview in the table row. Clicking it zooms rather than
// opening the row, so `stopPropagation` — the whole <tr> is a click target.
// A part with no photo keeps the same footprint so the name column stays
// aligned down the table.
function Thumbnail({ part, onZoom }: { part: SparePart; onZoom: () => void }) {
  const first = part.spare_part_photos?.[0];
  const extra = (part.spare_part_photos?.length ?? 0) - 1;

  if (!first) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-surface-border text-ink-faint">
        <BoxIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onZoom();
      }}
      aria-label={`${part.name} — photo`}
      className="relative block h-10 w-10 overflow-hidden rounded-md border border-surface-border transition hover:ring-2 hover:ring-brand-400"
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

function BoxIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
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
  // Photo blown up from the table thumbnail. Separate from partModal so a
  // quick visual check never drags the whole edit form open.
  const [lightbox, setLightbox] = useState<SparePart | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      [p.name, p.part_number, p.notes, p.company?.name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, parts]);

  function addCompany() {
    if (!companyName.trim()) return;
    submitCompany(null, companyName);
  }

  function selectBrand(id: string) {
    const params = new URLSearchParams();
    if (id) params.set("brand", id);
    router.push(`/spare-parts${params.toString() ? `?${params}` : ""}`);
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

  function statusChip(p: SparePart) {
    if (!p.is_approved) return <PendingBadge action={p.pending_action} />;
    const low = (p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0);
    return (
      <span className={`chip ${low ? "tone-warn" : "tone-done"}`}>
        {t(low ? "parts.lowStock" : "parts.inStock")}
      </span>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("parts.title")}
        subtitle={`${parts.length} ${t("parts.items")} · ${companies.length} ${t("parts.companies")}`}
        action={
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
            <button className="btn-ghost hidden md:inline-flex" onClick={() => setCompanyModal(true)}>
              {t("parts.newCompany")}
            </button>
            {/* The FAB below is md:hidden, so without this there was no way to
                add a spare part from a desktop browser. */}
            <button
              className="btn-primary hidden md:inline-flex"
              onClick={() => setPartModal({ open: true, part: null })}
            >
              {t("parts.newPart")}
            </button>
          </div>
        }
      />

      <Fab onClick={() => setPartModal({ open: true, part: null })} />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder={t("parts.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input sm:w-56"
          value={brandFilter}
          onChange={(e) => selectBrand(e.target.value)}
        >
          <option value="">{t("parts.allParts")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {companies.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          {t("parts.noCompanies")} {t("parts.startInventory")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          {t("parts.noPartsHere")}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="w-14 pl-4 pr-2 py-3">
                  <span className="sr-only">{t("misc.photos")}</span>
                </th>
                <th className="px-4 py-3">{t("parts.partNumber")}</th>
                <th className="px-4 py-3">{t("parts.partName")}</th>
                <th className="px-4 py-3">{t("customers.brand")}</th>
                <th className="px-4 py-3">{t("parts.quantity")}</th>
                <th className="px-4 py-3">{t("parts.price")}</th>
                <th className="px-4 py-3">{t("task.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setPartModal({ open: true, part: p })}
                  className="cursor-pointer border-b border-surface-border last:border-0 hover:bg-surface-soft"
                >
                  <td className="w-14 pl-4 pr-2 py-2">
                    <Thumbnail part={p} onZoom={() => setLightbox(p)} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.part_number || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.company?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.quantity}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {p.price != null ? Number(p.price).toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3">{statusChip(p)}</td>
                  <td className="px-4 py-3 text-right">
                    {!p.is_approved && manager ? (
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => approve(p.id)}
                          className="btn-primary h-7 px-2.5 text-xs"
                        >
                          {t("approval.approve")}
                        </button>
                        <button
                          onClick={() => reject(p)}
                          className="btn-ghost h-7 px-2.5 text-xs"
                        >
                          {t("approval.reject")}
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
