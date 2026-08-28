"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SPARE_PHOTOS_BUCKET, photoUrl } from "@/lib/storage";
import type { SparePart, SparePartPhoto } from "@/lib/types";
import {
  addPhotoRecord,
  deletePhoto,
  deleteSparePart,
  saveSparePart,
} from "@/app/(app)/spare-parts/actions";
import Modal from "@/components/modal";

export default function PartModal({
  editable,
  companyId,
  part,
  onClose,
  onChanged,
}: {
  editable: boolean;
  companyId: string;
  part: SparePart | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = !part;
  const [name, setName] = useState(part?.name ?? "");
  const [partNumber, setPartNumber] = useState(part?.part_number ?? "");
  const [quantity, setQuantity] = useState<number>(part?.quantity ?? 0);
  const [notes, setNotes] = useState(part?.notes ?? "");
  const [photos, setPhotos] = useState<SparePartPhoto[]>(
    part?.spare_part_photos ?? []
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Part name is required");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await saveSparePart(part?.id ?? null, {
      company_id: companyId,
      name,
      part_number: partNumber,
      quantity: Number(quantity) || 0,
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

  return (
    <Modal
      title={isNew ? "New part" : editable ? "Edit part" : name}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="label">Part name</label>
          <input
            className="input"
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Part number</label>
            <input
              className="input"
              value={partNumber}
              disabled={!editable}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Quantity</label>
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
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[70px] resize-y"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Photos */}
        <div>
          <label className="label">Photos</label>
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

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
