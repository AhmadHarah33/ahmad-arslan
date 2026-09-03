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
      price: price.trim() ? Number(price) : null,
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

  const footer = (
    <div className="flex items-center justify-between gap-2">
      {!isNew ? (
        <button className="btn-danger" onClick={remove} disabled={busy}>
          {t("common.delete")}
        </button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        {!isNew && !part!.is_approved && manager && (
          <>
            <button className="btn-ghost" onClick={reject} disabled={busy}>
              {t("approval.reject")}
            </button>
            <button
              className="btn-primary"
              onClick={() => doApprove(part!.id)}
              disabled={busy}
            >
              {t("approval.approve")}
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button className="btn-primary" onClick={save} disabled={busy}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      title={isNew ? t("common.new") : t("common.edit")}
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        {!isNew && !part!.is_approved && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-3 py-2.5">
            <PendingBadge action={part!.pending_action} />
            <p className="text-xs text-ink-faint">{t("approval.pendingExplain")}</p>
          </div>
        )}

        <div>
          <label className="label">{t("customers.brand")}</label>
          <select
            className="input"
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
          <label className="label">{t("parts.partName")}</label>
          <input
            className="input"
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("parts.partNumber")}</label>
            <input
              className="input"
              value={partNumber}
              disabled={!editable}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("parts.quantity")}</label>
            <input
              type="number"
              min={0}
              className="input"
              value={quantity}
              disabled={!editable}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("parts.threshold")}</label>
            <input
              type="number"
              min={0}
              className="input"
              value={minQuantity}
              disabled={!editable}
              onChange={(e) => setMinQuantity(Number(e.target.value))}
              placeholder="0 = no alert"
            />
          </div>
          <div>
            <label className="label">{t("parts.price")}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={price}
              disabled={!editable}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <label className="label">{t("parts.notes")}</label>
          <textarea
            className="input min-h-[70px] resize-y"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Photos */}
        <div>
          <label className="label">{t("misc.photos")}</label>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(p.storage_path)}
                  alt="part"
                  className="h-24 w-full rounded-lg object-cover"
                />
                {editable && (
                  <button
                    onClick={() => removePhoto(p)}
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
                className="flex h-24 items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-soft p-1 text-center text-[10px] text-ink-faint"
              >
                {f.name}
                <span className="block">(pending)</span>
              </div>
            ))}
          </div>
          {editable && (
            <label className="btn-ghost mt-2 w-full cursor-pointer">
              + Add photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) =>
                  setPendingFiles((prev) => [
                    ...prev,
                    ...Array.from(e.target.files ?? []),
                  ])
                }
              />
            </label>
          )}
          {isNew && (
            <p className="mt-1 text-xs text-ink-faint">
              Photos upload when you save the part.
            </p>
          )}
        </div>

        {!isNew && (
          <div className="border-t border-surface-border pt-4">
            <p className="label">{t("customers.properties")}</p>
            <CustomFields
              entity="spare_part"
              recordId={part!.id}
              canManage={editable}
              canEditValues={editable}
            />
          </div>
        )}

        {error && (
          <p className="alert-error">{error}</p>
        )}
      </div>
    </Modal>
  );
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
