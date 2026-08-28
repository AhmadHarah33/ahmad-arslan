"use client";

import type { FieldDefinition } from "@/lib/customFields";
import { isEmpty, tagClasses } from "@/lib/customFields";

// Read-only renderer for a single custom field value — used as chips on cards.
export default function FieldValue({
  def,
  value,
}: {
  def: FieldDefinition;
  value: unknown;
}) {
  if (isEmpty(value)) return null;

  switch (def.field_type) {
    case "select": {
      const opt = def.options.find((o) => o.id === value);
      if (!opt) return null;
      return <span className={`chip ${tagClasses(opt.color)}`}>{opt.label}</span>;
    }
    case "multi_select": {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return (
        <>
          {ids.map((id) => {
            const opt = def.options.find((o) => o.id === id);
            if (!opt) return null;
            return (
              <span key={id} className={`chip ${tagClasses(opt.color)}`}>
                {opt.label}
              </span>
            );
          })}
        </>
      );
    }
    case "checkbox":
      return value ? (
        <span className="chip bg-green-50 text-green-700">✓ {def.label}</span>
      ) : null;
    case "files": {
      const files = Array.isArray(value) ? (value as string[]) : [];
      return (
        <span className="chip bg-surface-soft text-ink-muted">
          📎 {files.length}
        </span>
      );
    }
    case "date":
      return (
        <span className="chip bg-surface-soft text-ink-muted">
          {new Date(String(value)).toLocaleDateString()}
        </span>
      );
    default:
      return (
        <span className="chip bg-surface-soft text-ink-muted">
          {String(value)}
        </span>
      );
  }
}
