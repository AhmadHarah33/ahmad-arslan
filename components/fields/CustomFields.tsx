"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FIELD_FILES_BUCKET, fieldFileUrl } from "@/lib/storage";
import {
  PREVIEW,
  previewFieldDefinitions,
  previewFieldValues,
} from "@/lib/preview";
import {
  FIELD_TYPES,
  TAG_COLOR_KEYS,
  defaultValue,
  newOptionId,
  tagClasses,
} from "@/lib/customFields";
import type {
  FieldDefinition,
  FieldEntity,
  FieldOption,
  FieldType,
} from "@/lib/customFields";
import { toastErr } from "@/lib/toast";
import {
  createField,
  deleteField,
  updateField,
  upsertFieldValue,
} from "@/app/(app)/fields/actions";

// The "+ Add a property" block dropped into each record's modal.
// `canManage`  -> may add / rename / delete fields (head or granted editor)
// `canEditValues` -> may fill values on THIS record (owner rules for tasks)
export default function CustomFields({
  entity,
  recordId,
  canManage,
  canEditValues,
}: {
  entity: FieldEntity;
  recordId: string;
  canManage: boolean;
  canEditValues: boolean;
}) {
  const [defs, setDefs] = useState<FieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (PREVIEW) {
        setDefs(previewFieldDefinitions[entity] ?? []);
        setValues({ ...(previewFieldValues[recordId] ?? {}) });
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const [{ data: d }, { data: v }] = await Promise.all([
        supabase
          .from("field_definitions")
          .select("*")
          .eq("entity", entity)
          .order("position", { ascending: true }),
        supabase.from("field_values").select("*").eq("record_id", recordId),
      ]);
      if (!active) return;
      setDefs((d ?? []) as FieldDefinition[]);
      const map: Record<string, unknown> = {};
      for (const row of v ?? []) map[(row as any).field_id] = (row as any).value;
      setValues(map);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [entity, recordId]);

  async function saveValue(fieldId: string, value: unknown) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    const res = await upsertFieldValue(fieldId, recordId, value);
    if (res?.error) toastErr(res.error);
  }

  async function onFieldCreated(def: FieldDefinition) {
    setDefs((prev) => [...prev, def]);
    setAdding(false);
  }

  async function onFieldDeleted(id: string) {
    setDefs((prev) => prev.filter((d) => d.id !== id));
    setValues((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function onOptionsChanged(id: string, options: FieldOption[]) {
    setDefs((prev) => prev.map((d) => (d.id === id ? { ...d, options } : d)));
  }

  if (loading) {
    return <p className="text-sm text-ink-faint">Loading fields…</p>;
  }

  return (
    <div className="space-y-3">
      {defs.map((def) => (
        <FieldRow
          key={def.id}
          def={def}
          value={values[def.id] ?? defaultValue(def.field_type)}
          recordId={recordId}
          canManage={canManage}
          canEditValues={canEditValues}
          onSave={(v) => saveValue(def.id, v)}
          onDeleted={() => onFieldDeleted(def.id)}
          onOptionsChanged={(opts) => onOptionsChanged(def.id, opts)}
        />
      ))}

      {defs.length === 0 && !canManage && (
        <p className="text-sm text-ink-faint">No custom fields yet.</p>
      )}

      {canManage &&
        (adding ? (
          <AddFieldForm
            entity={entity}
            onCancel={() => setAdding(false)}
            onCreated={onFieldCreated}
          />
        ) : (
          <button
            className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
            onClick={() => setAdding(true)}
          >
            <span className="text-base leading-none">+</span> Add a property
          </button>
        ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// One field row: label + type-appropriate input, with a manage menu.
// --------------------------------------------------------------------------- //
function FieldRow({
  def,
  value,
  recordId,
  canManage,
  canEditValues,
  onSave,
  onDeleted,
  onOptionsChanged,
}: {
  def: FieldDefinition;
  value: unknown;
  recordId: string;
  canManage: boolean;
  canEditValues: boolean;
  onSave: (v: unknown) => void;
  onDeleted: () => void;
  onOptionsChanged: (opts: FieldOption[]) => void;
}) {
  const [menu, setMenu] = useState(false);

  async function remove() {
    if (!confirm(`Delete the field "${def.label}"? Its values will be removed.`))
      return;
    const res = await deleteField(def.id);
    if (res?.error) return toastErr(res.error);
    onDeleted();
  }

  async function rename() {
    const label = prompt("Rename field", def.label);
    if (!label || !label.trim()) return;
    const res = await updateField(def.id, { label: label.trim() });
    if (res?.error) return toastErr(res.error);
    def.label = label.trim(); // local reflect
    setMenu(false);
  }

  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[7.5rem,1fr] sm:items-start sm:gap-3">
      <div className="flex items-center gap-1 sm:pt-1.5">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {def.label}
        </span>
        {canManage && (
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="text-ink-faint hover:text-ink"
              aria-label="Field options"
            >
              ⋯
            </button>
            {menu && (
              <div className="absolute left-0 top-5 z-10 w-32 rounded-lg border border-surface-border bg-surface py-1 shadow-pop">
                <button
                  onClick={rename}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-soft"
                >
                  Rename
                </button>
                <button
                  onClick={remove}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-surface-soft"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <FieldInput
        def={def}
        value={value}
        recordId={recordId}
        canManage={canManage}
        disabled={!canEditValues}
        onSave={onSave}
        onOptionsChanged={onOptionsChanged}
      />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Type-specific value input.
// --------------------------------------------------------------------------- //
function FieldInput({
  def,
  value,
  recordId,
  canManage,
  disabled,
  onSave,
  onOptionsChanged,
}: {
  def: FieldDefinition;
  value: unknown;
  recordId: string;
  canManage: boolean;
  disabled: boolean;
  onSave: (v: unknown) => void;
  onOptionsChanged: (opts: FieldOption[]) => void;
}) {
  switch (def.field_type) {
    case "text":
      return (
        <textarea
          className="input min-h-[38px] resize-y py-2"
          disabled={disabled}
          defaultValue={String(value ?? "")}
          onBlur={(e) => onSave(e.target.value)}
          placeholder="Empty"
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="input"
          disabled={disabled}
          defaultValue={value === "" || value == null ? "" : Number(value)}
          onBlur={(e) =>
            onSave(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder="Empty"
        />
      );
    case "date":
      return (
        <input
          type="date"
          className="input"
          disabled={disabled}
          value={value ? String(value) : ""}
          onChange={(e) => onSave(e.target.value)}
        />
      );
    case "url":
      return disabled ? (
        value ? (
          <a
            href={String(value)}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium text-brand-600"
          >
            🔗 {String(value)}
          </a>
        ) : (
          <span className="text-sm text-ink-faint">Empty</span>
        )
      ) : (
        <input
          type="url"
          className="input"
          defaultValue={String(value ?? "")}
          onBlur={(e) => onSave(e.target.value)}
          placeholder="https://…"
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 rounded border-surface-border text-brand-600"
          disabled={disabled}
          checked={!!value}
          onChange={(e) => onSave(e.target.checked)}
        />
      );
    case "select":
    case "multi_select":
      return (
        <SelectInput
          def={def}
          value={value}
          multi={def.field_type === "multi_select"}
          canManage={canManage}
          disabled={disabled}
          onSave={onSave}
          onOptionsChanged={onOptionsChanged}
        />
      );
    case "files":
      return (
        <FilesInput
          def={def}
          value={Array.isArray(value) ? (value as string[]) : []}
          recordId={recordId}
          disabled={disabled}
          onSave={onSave}
        />
      );
    default:
      return null;
  }
}

function SelectInput({
  def,
  value,
  multi,
  canManage,
  disabled,
  onSave,
  onOptionsChanged,
}: {
  def: FieldDefinition;
  value: unknown;
  multi: boolean;
  canManage: boolean;
  disabled: boolean;
  onSave: (v: unknown) => void;
  onOptionsChanged: (opts: FieldOption[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const selected = multi
    ? new Set(Array.isArray(value) ? (value as string[]) : [])
    : new Set(value ? [String(value)] : []);

  function toggle(id: string) {
    if (disabled) return;
    if (multi) {
      const next = new Set(selected);
      next.has(id) ? next.delete(id) : next.add(id);
      onSave([...next]);
    } else {
      onSave(selected.has(id) ? "" : id);
    }
  }

  async function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    const color = TAG_COLOR_KEYS[def.options.length % TAG_COLOR_KEYS.length];
    const opt = { id: newOptionId(), label, color };
    const options = [...def.options, opt];
    const res = await updateField(def.id, { options });
    if (res?.error) return toastErr(res.error);
    onOptionsChanged(options);
    setNewLabel("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {def.options.map((o) => {
        const on = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o.id)}
            className={`chip ${tagClasses(o.color)} ${
              on ? "ring-2 ring-brand-300" : "opacity-60 hover:opacity-100"
            } ${disabled ? "cursor-default" : "cursor-pointer"}`}
          >
            {o.label}
          </button>
        );
      })}
      {def.options.length === 0 && disabled && (
        <span className="text-sm text-ink-faint">Empty</span>
      )}
      {canManage &&
        (adding ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              className="input h-7 w-28 py-1 text-xs"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOption()}
              placeholder="New option"
            />
            <button className="text-xs text-brand-600" onClick={addOption}>
              Add
            </button>
          </span>
        ) : (
          <button
            className="chip border border-dashed border-surface-border text-ink-faint"
            onClick={() => setAdding(true)}
          >
            + option
          </button>
        ))}
    </div>
  );
}

function FilesInput({
  def,
  value,
  recordId,
  disabled,
  onSave,
}: {
  def: FieldDefinition;
  value: string[];
  recordId: string;
  disabled: boolean;
  onSave: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    if (PREVIEW) {
      // No backend — just reflect the names locally.
      const names = Array.from(files).map((f) => f.name);
      onSave([...value, ...names]);
      setBusy(false);
      return;
    }
    const supabase = createClient();
    const paths = [...value];
    for (const file of Array.from(files)) {
      const path = `${recordId}/${def.id}/${crypto.randomUUID()}-${file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;
      const up = await supabase.storage
        .from(FIELD_FILES_BUCKET)
        .upload(path, file);
      if (up.error) {
        toastErr(`Upload failed: ${up.error.message}`);
        setBusy(false);
        return;
      }
      paths.push(path);
    }
    onSave(paths);
    setBusy(false);
  }

  function isImage(p: string) {
    return /\.(png|jpe?g|gif|webp|avif)$/i.test(p);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={i} className="group relative">
            {isImage(p) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fieldFileUrl(p)}
                alt="file"
                className="h-16 w-16 rounded-lg object-cover"
              />
            ) : (
              <a
                href={PREVIEW ? undefined : fieldFileUrl(p)}
                target="_blank"
                rel="noreferrer"
                className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-soft p-1 text-center text-[10px] text-ink-muted"
              >
                {p.split("/").pop()?.slice(0, 16) ?? "file"}
              </a>
            )}
            {!disabled && (
              <button
                onClick={() => onSave(value.filter((_, idx) => idx !== i))}
                className="absolute -right-1 -top-1 rounded-full bg-ink/70 px-1 text-xs text-white"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <>
          <button
            className="btn-ghost mt-2 px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : "+ Add file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </>
      )}
      {disabled && value.length === 0 && (
        <span className="text-sm text-ink-faint">Empty</span>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// "Add a property" inline form.
// --------------------------------------------------------------------------- //
function AddFieldForm({
  entity,
  onCancel,
  onCreated,
}: {
  entity: FieldEntity;
  onCancel: () => void;
  onCreated: (def: FieldDefinition) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!label.trim()) return;
    setSaving(true);
    const needsOptions = type === "select" || type === "multi_select";
    const res = await createField({
      entity,
      label: label.trim(),
      field_type: type,
      options: needsOptions
        ? [
            { id: newOptionId(), label: "Option 1", color: "blue" },
            { id: newOptionId(), label: "Option 2", color: "green" },
          ]
        : [],
    });
    setSaving(false);
    if (res?.error) return toastErr(res.error);
    if (res?.field) onCreated(res.field as FieldDefinition);
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-soft p-3">
      <div className="mb-2 flex gap-2">
        <input
          autoFocus
          className="input flex-1"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Property name (e.g. TEŞHİS)"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FIELD_TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => setType(t.type)}
            className={`chip ${
              type === t.type
                ? "bg-brand-50 text-brand-700 ring-2 ring-brand-300"
                : "bg-surface text-ink-muted border border-surface-border"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary px-3 py-1.5 text-sm"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "Adding…" : "Add property"}
        </button>
      </div>
    </div>
  );
}
