"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SPARE_PHOTOS_BUCKET, photoUrl } from "@/lib/storage";
import type { Company, Profile, SparePart, SparePartPhoto } from "@/lib/types";
import {
  addPhotoRecord,
  deletePhoto,
  deleteSparePart,
  saveSparePart,
  approveSparePart,
  rejectSparePart,
} from "@/app/(app)/spare-parts/actions";
import { isManager } from "@/lib/permissions";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";
import CustomFields from "@/components/fields/CustomFields";
import PendingBadge from "@/components/pending-badge";
import { useAction } from "@/lib/use-action";
import { parseAmount, sanitizeAmount } from "@/lib/money";

export default function PartModal({
  profile,
  companies,
  part,
  onClose,
  onChanged,
}: {
  profile: Profile;
  companies: Company[];
  part: SparePart | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const isNew = !part;
  const editable = true;
  const manager = isManager(profile);

  const [companyId, setCompanyId] = useState(part?.company_id ?? companies[0]?.id ?? "");
  const [name, setName] = useState(part?.name ?? "");
  const [partNumber, setPartNumber] = useState(part?.part_number ?? "");
  const [quantity, setQuantity] = useState<number>(part?.quantity ?? 0);
  const [minQuantity, setMinQuantity] = useState<number>(part?.min_quantity ?? 0);
  const [price, setPrice] = useState<string>(part?.price != null ? String(part.price) : "");
  const [notes, setNotes] = useState(part?.notes ?? "");
  const [photos, setPhotos] = useState<SparePartPhoto[]>(part?.spare_part_photos ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { run: doApprove, pending: approving } = useAction(approveSparePart, {
    onSuccess: onChanged,
  });
  const { run: doReject, pending: rejecting } = useAction(rejectSparePart, {
    onSuccess: onChanged,
  });

  async function save() {
    if (!name.trim()) {
      setError(t("customers.nameRequired"));
      return;
    }
    if (!companyId) {
      setError(t("customers.brand"));
      return;
    }
    setSaving(true);
    setError(null);

    const res = await saveSparePart(part?.id ?? null, {
      company_id: companyId,
      name,
      part_number: partNumber,
      quantity: Number(quantity) || 0,
      min_quantity: Number(minQuantity) || 0,
      price: parseAmount(price),
      notes,
    });
    if (res?.error || !res?.id) {
      setSaving(false);
      setError(res?.error ?? "Failed to save");
      return;
    }

    // Upload any newly selected photos, then record them.
    if (pendingFiles.length > 0) {
      const supabase = createClient();
      for (const file of pendingFiles) {
        const path = `${res.id}/${crypto.randomUUID()}-${sanitize(file.name)}`;
        const up = await supabase.storage
          .from(SPARE_PHOTOS_BUCKET)
          .upload(path, file, { upsert: false });
        if (up.error) {
          setSaving(false);
          setError(`Upload failed: ${up.error.message}`);
          return;
        }
        const rec = await addPhotoRecord(res.id, path);
        if (rec?.error) {
          setSaving(false);
          setError(rec.error);
          return;
        }
      }
    }

    setSaving(false);
    onChanged();
  }

  async function removePhoto(p: SparePartPhoto) {
    if (!confirm("Remove this photo?")) return;
    const res = await deletePhoto(p.id, p.storage_path);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function remove() {
    if (!part) return;
    if (!confirm("Delete this part and its photos?")) return;
    setSaving(true);
    const res = await deleteSparePart(part.id);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  function reject() {
    if (!part) return;
    const key =
      part.pending_action === "delete"
        ? "approval.rejectConfirmDelete"
        : part.pending_action === "insert"
        ? "approval.rejectConfirmInsert"
        : "approval.rejectConfirm";
    if (!confirm(t(key))) return;
    doReject(part.id);
  }

  const busy = saving || approving || rejecting;

  const stock: "ok" | "low" | "neg" =
    quantity < 0 ? "neg" : minQuantity > 0 && quantity <= minQuantity ? "low" : "ok";
  const stockVar = { ok: "--tone-done", low: "--tone-warn", neg: "--tone-stuck" }[stock];
  const stockText = t(stock === "ok" ? "parts.inStock" : stock === "low" ? "parts.lowStock" : "parts.belowZero");

  const btn = "h-12 rounded-[14px] px-[18px] text-sm font-semibold transition disabled:opacity-50";
  const footer = (
    <div className="flex items-center justify-between gap-2">
      {!isNew ? (
        <button
          className={`${btn} border-[1.5px] hover:bg-surface-soft`}
          style={{
            borderColor: "rgb(var(--tone-stuck) / var(--tone-ring))",
            color: "rgb(var(--tone-stuck-ink))",
          }}
          onClick={remove}
          disabled={busy}
        >
          {t("common.delete")}
        </button>
      ) : (
        <span className="hidden text-xs text-ink-muted sm:block">
          <span style={{ color: "rgb(var(--tone-stuck-ink))" }}>*</span> {t("customers.required")}
        </span>
      )}
      <div className="ml-auto flex gap-2">
        {part && !part.is_approved && manager && (
          <>
            <button className={`${btn} bg-surface-soft text-ink`} onClick={reject} disabled={busy}>
              {t("approval.reject")}
            </button>
            <button
              className={`${btn} bg-brand-800 text-white`}
              onClick={() => doApprove(part.id)}
              disabled={busy}
            >
              {t("approval.approve")}
            </button>
          </>
        )}
        <button className={`${btn} bg-surface-soft text-ink`} onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button className={`${btn} bg-ink px-6 text-surface hover:opacity-90`} onClick={save} disabled={busy}>
          {saving ? t("common.saving") : isNew ? t("parts.savePart") : t("common.save")}
        </button>
      </div>
    </div>
  );

  const stepper = (value: number, set: (n: number) => void, label: string) => (
    <div className="flex h-[50px] items-center justify-between rounded-[14px] bg-surface px-1">
      <button
        type="button"
        aria-label={`${label} −`}
        onClick={() => set(value - 1)}
        className="h-[42px] w-[42px] rounded-[11px] bg-surface-soft text-lg"
      >
        −
      </button>
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-16 bg-transparent text-center text-lg font-bold text-ink outline-none"
      />
      <button
        type="button"
        aria-label={`${label} +`}
        onClick={() => set(value + 1)}
        className="h-[42px] w-[42px] rounded-[11px] bg-surface-soft text-lg"
      >
        +
      </button>
    </div>
  );

  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Read the files before clearing the input: the state updater runs later,
    // by which time `e.target.files` would already be empty.
    const picked = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };

  return (
    <Modal
      title={isNew ? t("parts.newSparePart") : t("common.edit")}
      onClose={onClose}
      footer={footer}
      lg
    >
      <div className="flex flex-col gap-4 bg-[rgb(var(--canvas))] p-4 md:flex-row md:gap-[22px] md:bg-transparent md:px-6 md:pb-6 md:pt-1">
        {/* ---- Photos ---- */}
        <div className="order-3 flex flex-col gap-2.5 rounded-[20px] bg-surface p-3.5 md:order-none md:flex-[1_1_240px] md:rounded-none md:bg-transparent md:p-0">
          <span className="text-[13px] font-semibold text-ink">{t("misc.photos")}</span>
          {editable && (
            <label className="hidden h-[200px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-dashed border-surface-border bg-surface-soft p-4 text-center md:flex">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-surface text-brand-600">
                <CameraIcon className="h-6 w-6" />
              </span>
              <span className="text-sm font-semibold text-brand-600">{t("parts.addPhotos")}</span>
              <span className="text-xs text-ink-muted">{t("parts.photoHint")}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(p.storage_path)}
                  alt="part"
                  className="aspect-square w-full rounded-[14px] object-cover"
                />
                {editable && (
                  <button
                    onClick={() => removePhoto(p)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 text-xs text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-[14px] border border-dashed border-surface-border bg-surface-soft p-1 text-center text-[10px] text-ink-muted"
              >
                <span className="line-clamp-3 break-all">
                  {f.name}
                  <span className="block">({t("parts.pending")})</span>
                </span>
              </div>
            ))}
            {editable && (
              <label className="flex aspect-square cursor-pointer items-center justify-center rounded-[14px] border border-dashed border-surface-border bg-surface-soft text-brand-600 md:hidden">
                <CameraIcon className="h-5 w-5" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
              </label>
            )}
          </div>
          {isNew && <span className="text-xs text-ink-muted">{t("parts.photosOnSave")}</span>}
        </div>

        {/* ---- Fields ---- */}
        <div className="contents md:flex md:flex-[2_1_420px] md:flex-col md:gap-4">
          {part && !part.is_approved && (
            <div className="order-1 flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-3 py-2.5 md:order-none">
              <PendingBadge action={part.pending_action} />
              <p className="text-xs text-ink-muted">{t("approval.pendingExplain")}</p>
            </div>
          )}

          <div className="order-1 flex flex-col gap-4 rounded-[20px] bg-surface p-3.5 md:order-none md:rounded-none md:bg-transparent md:p-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="part-brand">
                  {t("parts.company")} <span style={{ color: "rgb(var(--tone-stuck-ink))" }}>*</span>
                </label>
                <select
                  id="part-brand"
                  className="input !h-[50px] !rounded-[14px] !px-3.5 !text-[15px]"
                  value={companyId}
                  disabled={!editable}
                  onChange={(e) => setCompanyId(e.target.value)}
                >
                  {companies.length === 0 && <option value="">—</option>}
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="part-no">{t("parts.partNumber")}</label>
                <div className="flex h-[50px] overflow-hidden rounded-[14px] border-[1.5px] border-surface-border bg-surface focus-within:border-brand-500">
                  <span className="flex items-center bg-surface-soft px-3 text-[15px] font-bold text-brand-600">#</span>
                  <input
                    id="part-no"
                    className="min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink outline-none"
                    value={partNumber}
                    disabled={!editable}
                    placeholder="RT_071"
                    onChange={(e) => setPartNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="part-name">
                {t("parts.partName")} <span style={{ color: "rgb(var(--tone-stuck-ink))" }}>*</span>
              </label>
              <input
                id="part-name"
                className="input !h-[50px] !rounded-[14px] !px-4 !text-[15px]"
                value={name}
                disabled={!editable}
                placeholder={t("parts.namePlaceholder")}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Stock. Phone: a hero quantity card tinted by the live status. */}
          <div className="order-2 flex flex-col gap-3 md:order-none">
            <div
              className="flex items-center gap-3 rounded-[20px] p-3.5 text-white md:hidden"
              style={{ background: `rgb(var(${stockVar}-ink))` }}
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-medium text-white/75">{t("parts.quantity")}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold leading-tight">{quantity}</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold">
                    {stockText}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label={`${t("parts.quantity")} −`}
                onClick={() => setQuantity(quantity - 1)}
                className="h-11 w-11 rounded-[13px] bg-white/15 text-lg"
              >
                −
              </button>
              <button
                type="button"
                aria-label={`${t("parts.quantity")} +`}
                onClick={() => setQuantity(quantity + 1)}
                className="h-11 w-11 rounded-[13px] bg-white text-lg font-semibold"
                style={{ color: `rgb(var(${stockVar}-ink))` }}
              >
                +
              </button>
            </div>

            <div className="rounded-[20px] bg-surface p-3.5 md:rounded-[18px] md:bg-surface-soft md:p-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="hidden flex-col gap-1.5 md:flex">
                  <span className="text-[13px] font-semibold text-ink">{t("parts.quantity")}</span>
                  {stepper(quantity, setQuantity, t("parts.quantity"))}
                </div>
                <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                  <span className="text-[13px] font-semibold text-ink">{t("parts.threshold")}</span>
                  {stepper(minQuantity < 0 ? 0 : minQuantity, (n) => setMinQuantity(Math.max(0, n)), t("parts.threshold"))}
                </div>
              </div>
              <div className="mt-3 hidden items-center gap-2 text-xs text-ink-muted md:flex">
                {t("parts.willShowAs")}
                <span
                  className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
                  style={{
                    background: `rgb(var(${stockVar}) / 0.14)`,
                    color: `rgb(var(${stockVar}-ink))`,
                  }}
                >
                  {stockText}
                </span>
              </div>
            </div>
          </div>

          <div className="order-2 flex flex-col gap-4 rounded-[20px] bg-surface p-3.5 md:order-none md:rounded-none md:bg-transparent md:p-0">
            <div>
              <label className="label" htmlFor="part-price">{t("parts.price")}</label>
              {/* Plain text with a digit filter rather than type="number": the
                  spinner arrows and the browser's own mid-typing validation got
                  in the way of just entering an amount. */}
              <input
                id="part-price"
                type="text"
                inputMode="decimal"
                className="input !h-[50px] !rounded-[14px] !px-4 !text-[15px]"
                value={price}
                disabled={!editable}
                onChange={(e) => setPrice(sanitizeAmount(e.target.value))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label" htmlFor="part-notes">{t("parts.notes")}</label>
              <textarea
                id="part-notes"
                className="input min-h-[70px] resize-y"
                value={notes}
                disabled={!editable}
                placeholder={t("parts.notesPlaceholder")}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {part && (
            <div className="order-4 rounded-[20px] bg-surface p-3.5 md:order-none md:rounded-none md:border-t md:border-surface-border md:bg-transparent md:p-0 md:pt-4">
              <p className="label">{t("customers.properties")}</p>
              <CustomFields
                entity="spare_part"
                recordId={part.id}
                canManage={editable}
                canEditValues={editable}
              />
            </div>
          )}

          {error && <p className="alert-error order-5 md:order-none">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}

function CameraIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
