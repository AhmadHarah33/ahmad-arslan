// Shared domain types mirroring the Postgres schema.

export type UserRole = "head" | "organizer" | "engineer";
export type TaskStatus = "todo" | "in_progress" | "pending_approval" | "done" | "stuck";
export type TaskPriority = "low" | "medium" | "high";
export type TaskCurrency = "EUR" | "USD" | "TRY";

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
// An assignee as attached to a specific task, with the lead/responsible flag
// that lives on the task_assignees row rather than on the profile itself.
export type TaskAssignee = AssigneeLite & { is_lead: boolean };

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

// Catalog lists behind the customer form's City and Model pickers. Models
// hang off a brand, so picking a brand narrows the models on offer.
export interface City {
  id: string;
  name: string;
  created_at: string;
}

export interface MachineModel {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export type ApprovalAction = "insert" | "update" | "delete";
export type CustomerStatus = "active" | "inactive";

// A single machine belonging to a customer. A customer can have several —
// different brands, even different cities for a chain. Machine edits go
// through the same pending-approval gate as the rest of a customer's data.
export interface CustomerMachine {
  id: string;
  customer_id: string;
  city_id: string | null;
  company_id: string | null;
  model_id: string | null;
  serial_number: string;
  // Standard (manufacturer) warranty end; an agreement can extend it.
  warranty_end: string | null;
  is_approved: boolean;
  pending_action: ApprovalAction | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  city?: Pick<City, "id" | "name"> | null;
  company?: Pick<Company, "id" | "name"> | null;
  model?: Pick<MachineModel, "id" | "name"> | null;
}

export interface Customer {
  id: string;
  name: string;
  location: string;
  machine: string;
  serial_number: string;
  company_id: string | null;
  // `location`, `machine`, `serial_number`, `city_id`, `company_id` and
  // `model_id` all mirror the customer's *primary* machine (the earliest one
  // added to `customer_machines`), kept in sync by
  // sync_customer_primary_machine so search, import/export, the print sheet
  // and the brand filter keep reading one plain set of columns even though a
  // customer can have more than one machine.
  city_id: string | null;
  model_id: string | null;
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
  customer_machines?: CustomerMachine[];
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
  // Catalog links, replacing the old "Yer" / "Makina" custom fields so the
  // city list is shared with customers and models can be filtered by brand.
  city_id: string | null;
  company_id: string | null;
  model_id: string | null;
  // What the job cost in parts, and what the customer is charged for it.
  parts_cost: number | null;
  service_charge: number | null;
  parts_currency: TaskCurrency;
  service_currency: TaskCurrency;
  position: number;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  completed_at?: string | null;
  // Multiple engineers can be assigned. Empty array = unassigned. At most one
  // has is_lead === true.
  assignees: TaskAssignee[];
}

// A spare part attached to a task, priced for this job specifically —
// `unit_price` defaults to the catalog price when the part is picked but is
// editable per line from there, since a job can be billed differently from
// the shelf price.
export interface TaskPart {
  id: string;
  task_id: string;
  spare_part_id: string;
  quantity: number;
  unit_price: number | null;
  created_at: string;
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

export const CURRENCY_SYMBOLS: Record<TaskCurrency, string> = {
  EUR: "€",
  USD: "$",
  TRY: "₺",
};
export const TASK_CURRENCIES: TaskCurrency[] = ["EUR", "USD", "TRY"];

// ---------------------------------------------------------------------------
// Bakım & Garanti: service agreements
// ---------------------------------------------------------------------------

// periodic = N visits per year; annual = ONE visit (another one the same year
// is a new agreement).
// warranty = "Garanti uzatma only": extends the machine's warranty, no visits.
export type AgreementPlan = "periodic" | "annual" | "warranty";
// draft = saved but not live: no board tasks are created until it's activated.
export type AgreementStatus = "draft" | "active" | "ended" | "cancelled";
export type WarrantyCoverage = "parts_labour" | "labour" | "parts";
export type RemindDays = 3 | 7 | 14;
export type PaymentStatus = "unpaid" | "paid";

export interface Agreement {
  id: string;
  customer_id: string;
  plan: AgreementPlan;
  visits_per_year: number;
  start_date: string;
  end_date: string;
  includes_warranty: boolean;
  warranty_end: string | null;
  // What the extended warranty covers and for how many months after the
  // factory warranty; warranty_end is the resulting (overridable) date.
  coverage: WarrantyCoverage | null;
  warranty_months: number | null;
  // Days before a visit's due date that its board task appears.
  remind_days: RemindDays;
  // Path in the private agreement-contracts bucket (signed PDF).
  contract_path: string | null;
  amount: number | null;
  currency: TaskCurrency;
  payment_status: PaymentStatus;
  payment_due: string | null;
  paid_at: string | null;
  status: AgreementStatus;
  assignee_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
}

export interface AgreementVisit {
  id: string;
  agreement_id: string;
  seq: number;
  due_date: string;
  task_id: string | null;
  done_at: string | null;
}

// Row of the agreement_overview view: the agreement plus the derived states
// the dashboard needs. Expiring / Overdue / Unpaid are computed, never stored.
export interface AgreementOverview extends Agreement {
  customer_name: string;
  next_visit: string | null;
  visits_done: number;
  visits_total: number;
  is_overdue: boolean;
  is_expiring: boolean;
  is_unpaid: boolean;
  payment_overdue: boolean;
}
