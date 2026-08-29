// Shared domain types mirroring the Postgres schema.

export type UserRole = "head" | "engineer";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Profile {
  id: string;
  full_name: string;
  first_name: string;
  role: UserRole;
  can_edit: boolean;
  created_at: string;
  theme_accent?: string;
  theme_mode?: "light" | "dark" | "system";
}

export type AssigneeLite = Pick<Profile, "id" | "full_name" | "first_name">;

export type BackgroundStyle = "solid" | "wallpaper";

// Global, owner-controlled app settings (single row, id=1).
export interface AppSettings {
  id: number;
  company_name: string;
  company_phone: string;
  company_address: string;
  logo_url: string | null;
  bg_style: BackgroundStyle;
  bg_blur: number; // 0-100, only used when bg_style === "wallpaper"
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface CustomerLink {
  id: string;
  customer_id: string;
  label: string;
  url: string;
}

export interface Customer {
  id: string;
  name: string;
  location: string;
  machine: string;
  serial_number: string;
  created_by: string | null;
  created_at: string;
  customer_links?: CustomerLink[];
}

export interface SparePartPhoto {
  id: string;
  spare_part_id: string;
  storage_path: string;
  created_at: string;
}

export interface SparePart {
  id: string;
  company_id: string;
  name: string;
  part_number: string;
  quantity: number;
  min_quantity?: number;
  notes: string;
  created_at: string;
  spare_part_photos?: SparePartPhoto[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  customer_id: string | null;
  position: number;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  completed_at?: string | null;
  // Multiple engineers can be assigned. Empty array = unassigned.
  assignees: AssigneeLite[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  field_values: Record<string, unknown>;
}

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
