"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Company, Profile, SparePart } from "@/lib/types";
import { canEditData } from "@/lib/permissions";
import { photoUrl } from "@/lib/storage";
import { saveCompany } from "@/app/(app)/spare-parts/actions";
import Modal from "@/components/modal";
import PartModal from "./part-modal";

export default function SparePartsView({
  profile,
  companies,
  parts,
  initialQuery = "",
}: {
  profile: Profile;
  companies: Company[];
  parts: SparePart[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const editable = canEditData(profile);
  const [query, setQuery] = useState(initialQuery);
  const [companyModal, setCompanyModal] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [partModal, setPartModal] = useState<{
    open: boolean;
    part: SparePart | null;
    companyId: string | null;
  }>({ open: false, part: null, companyId: null });

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.map((c) => ({
      company: c,
      parts: parts.filter(
        (p) =>
          p.company_id === c.id &&
          (!q ||
            [p.name, p.part_number, p.notes]
              .join(" ")
              .toLowerCase()
              .includes(q))
      ),
    }));
  }, [companies, parts, query]);

  async function addCompany() {
    if (!companyName.trim()) return;
    setSavingCompany(true);
    const res = await saveCompany(null, companyName);
    setSavingCompany(false);
    if (res?.error) {
      alert(res.error);
      return;
    }
    setCompanyName("");
    setCompanyModal(false);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink md:text-2xl">Spare parts</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {parts.length} items · {companies.length} companies
          </p>
        </div>
        {editable && (
          <button className="btn-ghost" onClick={() => setCompanyModal(true)}>
            + Company
          </button>
        )}
      </div>

      <input
        className="input mb-5"
        placeholder="Search parts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {companies.length === 0 && (
        <div className="card px-5 py-10 text-center text-sm text-ink-faint">
          No companies yet. {editable && "Add one to start your inventory."}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(({ company, parts: cParts }) => (
          <section key={company.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{company.name}</h2>
              {editable && (
                <button
                  className="text-sm font-medium text-brand-600"
                  onClick={() =>
                    setPartModal({
                      open: true,
                      part: null,
                      companyId: company.id,
                    })
                  }
                >
                  + Add part
                </button>
              )}
            </div>
            {cParts.length === 0 ? (
              <p className="rounded-xl bg-surface-soft px-4 py-3 text-sm text-ink-faint">
                No parts here yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {cParts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPartModal({
                        open: true,
                        part: p,
                        companyId: company.id,
                      })
                    }
                    className="card block overflow-hidden text-left transition hover:shadow-pop"
                  >
                    <div className="flex h-20 items-center justify-center bg-surface-soft">
                      {p.spare_part_photos && p.spare_part_photos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl(p.spare_part_photos[0].storage_path)}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-ink-faint">No photo</span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {p.name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-ink-faint">
                        {p.part_number ? <span className="truncate">#{p.part_number}</span> : <span />}
                        {(p.min_quantity ?? 0) > 0 && p.quantity <= (p.min_quantity ?? 0) ? (
                          <span className="chip bg-amber-50 px-1.5 py-0 text-amber-700">Low · {p.quantity}</span>
                        ) : (
                          <span className="shrink-0">Qty {p.quantity}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {companyModal && (
        <Modal title="New company" onClose={() => setCompanyModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Company name</label>
              <input
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Sirona"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="btn-ghost"
                onClick={() => setCompanyModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={addCompany}
                disabled={savingCompany}
              >
                {savingCompany ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {partModal.open && partModal.companyId && (
        <PartModal
          editable={editable}
          companyId={partModal.companyId}
          part={partModal.part}
          onClose={() =>
            setPartModal({ open: false, part: null, companyId: null })
          }
          onChanged={() => {
            setPartModal({ open: false, part: null, companyId: null });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
