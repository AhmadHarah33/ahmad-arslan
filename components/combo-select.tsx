"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";

type Option = { id: string; name: string };

// A picker over a managed list that can also add to it without leaving the
// form. Built on a real <select> plus an "add new" mode rather than a custom
// typeahead: the native control already handles keyboard, mobile pickers and
// long lists correctly, and getting that wrong in a hand-rolled dropdown is
// how these end up worse than the free-text field they replaced.
export default function ComboSelect({
  value,
  options,
  onChange,
  onCreate,
  emptyLabel,
  disabled = false,
  disabledHint,
}: {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  // Returns the created row so the form can select it immediately.
  onCreate: (name: string) => Promise<{ id?: string; error?: string }>;
  emptyLabel: string;
  // Models are disabled until a brand is chosen — there is nothing to list.
  disabled?: boolean;
  disabledHint?: string;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    const res = await onCreate(name);
    setBusy(false);
    if (res.error) return toastErr(res.error);
    if (res.id) onChange(res.id);
    setDraft("");
    setAdding(false);
  }

  if (disabled) {
    return (
      <>
        <select className="input" value="" disabled>
          <option value="">{emptyLabel}</option>
        </select>
        {disabledHint && (
          <p className="mt-1 text-xs text-ink-faint">{disabledHint}</p>
        )}
      </>
    );
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={draft}
          autoFocus
          placeholder={t("catalog.newNamePlaceholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setAdding(false);
            }
          }}
        />
        <button
          type="button"
          className="btn-primary shrink-0 px-3"
          onClick={create}
          disabled={busy || !draft.trim()}
        >
          {busy ? t("common.saving") : t("common.add")}
        </button>
        <button
          type="button"
          className="btn-ghost shrink-0 px-3"
          onClick={() => setAdding(false)}
          disabled={busy}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      <option value="__new__">＋ {t("catalog.addNew")}</option>
    </select>
  );
}
