// Shared domain types mirroring the Postgres schema.

export type UserRole = "head" | "organizer" | "engineer";
export type TaskStatus = "todo" | "in_progress" | "pending_approval" | "done" | "stuck";
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

export type ApprovalAction = "insert" | "update" | "delete";
export type CustomerStatus = "active" | "inactive";

export interface Customer {
  id: string;
  name: string;
  location: string;
  machine: string;
  serial_number: string;
  company_id: string | null;
  contact_person: string;
  contact_info: string;
  status: CustomerStatus;
  is_approved: boolean;
  pending_action: ApprovalAction | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  customer_links?: CustomerLink[];
  company?: Pick<Company, "id" | "name"> | null;
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
  price: number | null;
  notes: string;
  is_approved: boolean;
  pending_action: ApprovalAction | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  spare_part_photos?: SparePartPhoto[];
  company?: Pick<Company, "id" | "name"> | null;
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
  { key: "pending_approval", label: "Pending approval" },
  { key: "done", label: "Done" },
  { key: "stuck", label: "Stuck" },
];

// Each status's hue, named as a --tone-* token from app/globals.css. Consumed
// through inline styles (column wash, status dot, donut) so it follows the
// light/dark switch without a second palette.
export const STATUS_VAR: Record<TaskStatus, string> = {
  todo: "--tone-neutral",
  in_progress: "--tone-yellow",
  pending_approval: "--tone-orange",
  done: "--tone-done",
  stuck: "--tone-stuck",
};

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
