// Shared types + registry for the custom-fields engine ("+ Add a property").

export type FieldEntity = "task" | "customer" | "spare_part";

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "url"
  | "files";

export interface FieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface FieldDefinition {
  id: string;
  entity: FieldEntity;
  label: string;
  field_type: FieldType;
  options: FieldOption[];
  position: number;
  created_at?: string;
}

export interface FieldValue {
  id?: string;
  field_id: string;
  record_id: string;
  value: unknown;
}

// The deliberately small, user-facing type picker (order shown in the popover).
export const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: "text", label: "Text", icon: "≡" },
  { type: "number", label: "Number", icon: "#" },
  { type: "date", label: "Date", icon: "📅" },
  { type: "select", label: "Select", icon: "◉" },
  { type: "multi_select", label: "Multi-select", icon: "☰" },
  { type: "checkbox", label: "Checkbox", icon: "☑" },
  { type: "url", label: "URL / Link", icon: "🔗" },
  { type: "files", label: "Files", icon: "📎" },
];

// Tailwind classes for option/tag colors. Keys match the `color` in options.
const TAG_COLORS: Record<string, string> = {
  gray: "tone-neutral",
  red: "tone-stuck",
  amber: "tone-warn",
  green: "tone-done",
  blue: "tone-progress",
  purple: "tone-purple",
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

export function tagClasses(color?: string): string {
  return TAG_COLORS[color ?? "gray"] ?? TAG_COLORS.gray;
}

// A short, url-safe id for new options.
export function newOptionId(): string {
  return "o_" + Math.random().toString(36).slice(2, 9);
}

// Empty/default value for a freshly rendered field of each type.
export function defaultValue(type: FieldType): unknown {
  switch (type) {
    case "checkbox":
      return false;
    case "multi_select":
    case "files":
      return [];
    default:
      return "";
  }
}

// Is a value "empty" (so we can skip storing it / show a placeholder)?
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
