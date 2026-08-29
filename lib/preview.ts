// -----------------------------------------------------------------------------
// PREVIEW / DEMO MODE
//
// When NEXT_PUBLIC_PREVIEW=1, the app runs with NO backend: login is skipped and
// every screen is filled with the sample data below so the whole UI can be
// clicked through (e.g. on a Vercel preview deploy). Nothing is persisted.
// Remove the env var (or set it to 0) to use the real Supabase backend.
// -----------------------------------------------------------------------------

import type {
  AppSettings,
  Company,
  Customer,
  Profile,
  SparePart,
  Task,
  TaskTemplate,
} from "./types";
import type { FieldDefinition } from "./customFields";

export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === "1";

export const previewAppSettings: AppSettings = {
  id: 1,
  company_name: "Mars Med Dent",
  company_phone: "",
  company_address: "",
  logo_url: null,
  bg_style: "solid",
  bg_blur: 40,
};

export const previewProfile: Profile = {
  id: "u-head",
  full_name: "Ahmed Hassan",
  first_name: "Ahmed",
  role: "head",
  can_edit: true,
  created_at: new Date().toISOString(),
  theme_accent: "sky",
  theme_mode: "system",
};

export const previewEngineers: Profile[] = [
  previewProfile,
  {
    id: "u-eng-1",
    full_name: "Omar Khaled",
    first_name: "Omar",
    role: "engineer",
    can_edit: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "u-eng-2",
    full_name: "Sara Nabil",
    first_name: "Sara",
    role: "engineer",
    can_edit: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "u-eng-3",
    full_name: "Youssef Adel",
    first_name: "Youssef",
    role: "engineer",
    can_edit: false,
    created_at: new Date().toISOString(),
  },
];

export const previewCompanies: Company[] = [
  { id: "c-sirona", name: "Sirona", created_at: "" },
  { id: "c-planmeca", name: "Planmeca", created_at: "" },
  { id: "c-kavo", name: "KaVo", created_at: "" },
  { id: "c-nsk", name: "NSK", created_at: "" },
];

export const previewCustomers: Customer[] = [
  {
    id: "cus-1",
    name: "Nile Dental Clinic",
    location: "Cairo, Maadi",
    machine: "Sirona Orthophos SL",
    serial_number: "SL-2291-A",
    created_by: "u-head",
    created_at: "",
    customer_links: [
      { id: "l1", customer_id: "cus-1", label: "Install photos", url: "#" },
      { id: "l2", customer_id: "cus-1", label: "Contract", url: "#" },
    ],
  },
  {
    id: "cus-2",
    name: "Bright Smile Center",
    location: "Alexandria",
    machine: "Planmeca ProMax 3D",
    serial_number: "PM3D-7742",
    created_by: "u-head",
    created_at: "",
    customer_links: [
      { id: "l3", customer_id: "cus-2", label: "Service log", url: "#" },
    ],
  },
  {
    id: "cus-3",
    name: "Delta Medical Group",
    location: "Mansoura",
    machine: "KaVo Estetica E70",
    serial_number: "E70-1188",
    created_by: "u-head",
    created_at: "",
    customer_links: [],
  },
  {
    id: "cus-4",
    name: "Royal Dental Care",
    location: "Giza",
    machine: "Sirona Intego",
    serial_number: "INT-4520",
    created_by: "u-head",
    created_at: "",
    customer_links: [
      { id: "l4", customer_id: "cus-4", label: "Drive folder", url: "#" },
    ],
  },
];

function photo(id: string, seed: string) {
  // Absolute URL — photoUrl() passes absolute URLs through unchanged.
  return {
    id,
    spare_part_id: "",
    storage_path: `https://picsum.photos/seed/${seed}/400/300`,
    created_at: "",
  };
}

export const previewSpareParts: SparePart[] = [
  {
    id: "sp-1",
    company_id: "c-sirona",
    name: "X-ray sensor cable",
    part_number: "SR-CBL-09",
    quantity: 6,
    notes: "Compatible with Orthophos SL / XG.",
    created_at: "",
    spare_part_photos: [photo("p1", "sensor")],
  },
  {
    id: "sp-2",
    company_id: "c-sirona",
    name: "Handpiece coupling",
    part_number: "SR-HP-22",
    quantity: 14,
    notes: "",
    created_at: "",
    spare_part_photos: [photo("p2", "coupling")],
  },
  {
    id: "sp-3",
    company_id: "c-planmeca",
    name: "Tube head assembly",
    part_number: "PM-TH-51",
    quantity: 2,
    min_quantity: 4,
    notes: "Low stock — reorder soon.",
    created_at: "",
    spare_part_photos: [photo("p3", "tubehead")],
  },
  {
    id: "sp-4",
    company_id: "c-planmeca",
    name: "Foot control pedal",
    part_number: "PM-FC-08",
    quantity: 9,
    notes: "",
    created_at: "",
    spare_part_photos: [],
  },
  {
    id: "sp-5",
    company_id: "c-kavo",
    name: "LED lamp module",
    part_number: "KV-LED-31",
    quantity: 5,
    min_quantity: 6,
    notes: "For Estetica E70 chair light.",
    created_at: "",
    spare_part_photos: [photo("p5", "ledlamp")],
  },
  {
    id: "sp-6",
    company_id: "c-nsk",
    name: "Turbine rotor",
    part_number: "NSK-RT-77",
    quantity: 20,
    notes: "",
    created_at: "",
    spare_part_photos: [photo("p6", "rotor")],
  },
];

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const A = {
  head: { id: "u-head", full_name: "Ahmed Hassan", first_name: "Ahmed" },
  omar: { id: "u-eng-1", full_name: "Omar Khaled", first_name: "Omar" },
  sara: { id: "u-eng-2", full_name: "Sara Nabil", first_name: "Sara" },
};

export const previewTasks: Task[] = [
  {
    id: "t-1",
    title: "Repair chair unit at Nile Dental",
    description: "Hydraulic lift not raising. Bring spare pump.",
    status: "in_progress",
    priority: "high",
    customer_id: "cus-1",
    position: 1,
    due_date: daysFromNow(1),
    created_by: "u-head",
    created_at: "",
    assignees: [A.head, A.omar],
  },
  {
    id: "t-2",
    title: "Install X-ray sensor — Bright Smile",
    description: "New Planmeca sensor calibration.",
    status: "todo",
    priority: "medium",
    customer_id: "cus-2",
    position: 2,
    due_date: daysFromNow(3),
    created_by: "u-head",
    created_at: "",
    assignees: [A.head],
  },
  {
    id: "t-3",
    title: "Quarterly maintenance — Delta Medical",
    description: "Full preventive maintenance checklist.",
    status: "todo",
    priority: "low",
    customer_id: "cus-3",
    position: 3,
    due_date: null,
    created_by: "u-head",
    created_at: "",
    assignees: [], // unassigned — claimable
  },
  {
    id: "t-4",
    title: "Replace foot pedal — Royal Dental",
    description: "",
    status: "done",
    priority: "medium",
    customer_id: "cus-4",
    position: 4,
    due_date: daysFromNow(-2),
    created_by: "u-head",
    created_at: "",
    completed_at: new Date().toISOString(),
    assignees: [A.omar],
  },
  {
    id: "t-5",
    title: "Diagnose turbine noise — Delta",
    description: "Reported grinding noise on high-speed handpiece.",
    status: "in_progress",
    priority: "high",
    customer_id: "cus-3",
    position: 5,
    due_date: daysFromNow(2),
    created_by: "u-head",
    created_at: "",
    assignees: [A.sara],
  },
  {
    id: "t-6",
    title: "Firmware update — Sirona Intego",
    description: "",
    status: "todo",
    priority: "medium",
    customer_id: "cus-4",
    position: 6,
    due_date: daysFromNow(5),
    created_by: "u-head",
    created_at: "",
    assignees: [A.omar],
  },
];

// --- Custom-field sample data (mirrors the seeded preset fields) -----------

export const previewFieldDefinitions: Record<string, FieldDefinition[]> = {
  task: [
    {
      id: "fd-task-mudahale",
      entity: "task",
      label: "Müdahale şekli",
      field_type: "select",
      position: 1,
      options: [
        { id: "o_musteride", label: "müşteride", color: "amber" },
        { id: "o_uzaktan", label: "uzaktan", color: "blue" },
        { id: "o_serviste", label: "serviste", color: "green" },
      ],
    },
    {
      id: "fd-task-yer",
      entity: "task",
      label: "Yer",
      field_type: "select",
      position: 2,
      options: [
        { id: "o_istanbul", label: "İstanbul", color: "amber" },
        { id: "o_ankara", label: "Ankara", color: "blue" },
        { id: "o_izmir", label: "İzmir", color: "green" },
      ],
    },
    {
      id: "fd-task-makina",
      entity: "task",
      label: "Makina",
      field_type: "select",
      position: 3,
      options: [{ id: "o_riton", label: "RITON D-150", color: "purple" }],
    },
    { id: "fd-task-teshis", entity: "task", label: "TEŞHİS", field_type: "text", position: 4, options: [] },
    { id: "fd-task-cozum", entity: "task", label: "ÇÖZÜM", field_type: "text", position: 5, options: [] },
    { id: "fd-task-rapor", entity: "task", label: "Rapor", field_type: "files", position: 6, options: [] },
  ],
  customer: [
    {
      id: "fd-cus-brand",
      entity: "customer",
      label: "Brand",
      field_type: "select",
      position: 1,
      options: [{ id: "o_micronx", label: "MicroNX", color: "blue" }],
    },
    { id: "fd-cus-install", entity: "customer", label: "Installation Date", field_type: "date", position: 2, options: [] },
    {
      id: "fd-cus-warranty",
      entity: "customer",
      label: "Warranty",
      field_type: "select",
      position: 3,
      options: [
        { id: "o_in", label: "IN", color: "green" },
        { id: "o_out", label: "OUT", color: "red" },
      ],
    },
    { id: "fd-cus-service", entity: "customer", label: "Service History", field_type: "files", position: 4, options: [] },
  ],
  spare_part: [],
};

// record_id -> { field_id -> value }
export const previewFieldValues: Record<string, Record<string, unknown>> = {
  "t-1": {
    "fd-task-mudahale": "o_musteride",
    "fd-task-yer": "o_istanbul",
    "fd-task-makina": "o_riton",
    "fd-task-teshis": "Hidrolik pompa arızası tespit edildi.",
  },
  "cus-1": {
    "fd-cus-brand": "o_micronx",
    "fd-cus-install": "2025-02-10",
    "fd-cus-warranty": "o_in",
  },
};

// Spread created dates across recent months so the dashboard chart shows data.
previewTasks.forEach((t, i) => {
  t.created_at = new Date(Date.now() - i * 27 * 86400000).toISOString();
});

export const previewTemplates: TaskTemplate[] = [
  { id: "tpl-install", name: "Installation", description: "New machine installation and calibration.", priority: "medium", field_values: {} },
  { id: "tpl-repair", name: "Repair", description: "On-site repair visit.", priority: "high", field_values: {} },
  { id: "tpl-maint", name: "Preventive maintenance", description: "Routine preventive maintenance checklist.", priority: "low", field_values: {} },
];

// Build a mock task from create-form input so the board updates locally in
// preview mode without a backend.
export function makePreviewTask(input: {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee_ids: string[];
  customer_id: string | null;
  due_date: string | null;
}): Task {
  const assignees = previewEngineers
    .filter((e) => input.assignee_ids.includes(e.id))
    .map((e) => ({ id: e.id, full_name: e.full_name, first_name: e.first_name }));
  return {
    id: `t-${Math.random().toString(36).slice(2, 9)}`,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    customer_id: input.customer_id,
    position: Date.now(),
    due_date: input.due_date,
    created_by: previewProfile.id,
    created_at: new Date().toISOString(),
    assignees,
  };
}
