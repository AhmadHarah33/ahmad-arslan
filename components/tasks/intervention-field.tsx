"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { upsertFieldValue } from "@/app/(app)/fields/actions";
import type { FieldDefinition } from "@/lib/customFields";
import { translateFieldLabel } from "@/lib/i18n/dictionary";
import { useLanguage } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";

// The "Intervention type" custom property, pulled out of the Properties list
// and shown as a row of options under the customer, like status and priority.
// It is still an ordinary custom field underneath (same definition, same
// stored value), so reports and the old Properties data keep working.
//
// For a task that exists the pick is saved straight away. For a new task there
// is no record to attach it to yet, so the pick is reported to the parent
// (`onPick`), which saves it once createTask returns an id.
export default function InterventionField({
  recordId,
  disabled,
  onPick,
}: {
  recordId?: string;
  disabled?: boolean;
  onPick: (fieldId: string, optionId: string) => void;
}) {
  const { lang } = useLanguage();
  const [def, setDef] = useState<FieldDefinition | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: defs } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("entity", "task")
        // Stored in Turkish ("Müdahale şekli"); the app only translates it for display.
        .or("label.ilike.müdahale%,label.ilike.intervention%")
        .order("position", { ascending: true })
        .limit(1);
      const d = ((defs ?? [])[0] ?? null) as FieldDefinition | null;
      if (!active) return;
      setDef(d);
      if (d) {
        onPick(d.id, "");
        if (recordId) {
          const { data: v } = await supabase
            .from("field_values")
            .select("value")
            .eq("field_id", d.id)
            .eq("record_id", recordId)
            .maybeSingle();
          if (active && v?.value) setValue(String(v.value));
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  if (!def || def.options.length === 0) return null;

  async function pick(id: string) {
    if (disabled || !def) return;
    const next = value === id ? "" : id;
    setValue(next);
    onPick(def.id, next);
    if (recordId) {
      const res = await upsertFieldValue(def.id, recordId, next);
      if (res?.error) toastErr(res.error);
    }
  }

  const label = translateFieldLabel(def.label, lang);
  return (
    <div>
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {def.options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => pick(o.id)}
              className={`h-9 rounded-full border-[1.5px] bg-surface px-3 text-xs font-semibold text-ink transition disabled:opacity-60 ${
                on ? "border-ink" : "border-surface-border hover:border-ink-faint"
              }`}
            >
              {translateFieldLabel(o.label, lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
