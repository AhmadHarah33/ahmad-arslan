"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import { useT } from "@/lib/i18n/provider";

// A long description is painful to read or edit in an 80px box inside an
// already-scrolling modal. Past this much text the field collapses to a
// preview and the real editing happens in a full writing surface instead.
const LONG_CHARS = 180;
const LONG_LINES = 4;

function isLong(text: string) {
  return text.length > LONG_CHARS || text.split("\n").length > LONG_LINES;
}

export default function DescriptionField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = isLong(value);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="label mb-0">{t("task.description")}</label>
        {(long || value.length > 0) && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 transition hover:underline"
          >
            <ExpandIcon className="h-3.5 w-3.5" />
            {disabled ? t("task.descriptionRead") : t("task.descriptionOpen")}
          </button>
        )}
      </div>

      {long ? (
        // Collapsed preview — the whole thing is the button, so a tap anywhere
        // opens the editor rather than dropping a caret into a cramped box.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-surface-border bg-surface-soft/60 p-3 text-left transition hover:border-brand-600/40 hover:bg-surface-soft"
        >
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-ink">
            {value}
          </p>
          <span className="mt-2 block text-xs font-medium text-ink-faint">
            {disabled ? t("task.descriptionPressRead") : t("task.descriptionPressEdit")}
          </span>
        </button>
      ) : (
        <textarea
          className="input min-h-[80px] resize-y"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={disabled ? "" : t("task.descriptionPlaceholder")}
        />
      )}

      {open && (
        <Modal title={t("task.description")} onClose={() => setOpen(false)} wide>
          <textarea
            className="input min-h-[55vh] resize-none border-0 bg-transparent px-0 text-[15px] leading-relaxed focus:ring-0"
            value={value}
            disabled={disabled}
            autoFocus={!disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={disabled ? "" : t("task.descriptionPlaceholder")}
          />
        </Modal>
      )}
    </div>
  );
}

function ExpandIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
