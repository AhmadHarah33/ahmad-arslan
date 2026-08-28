// -----------------------------------------------------------------------------
// PREVIEW / DEMO MODE
//
// When NEXT_PUBLIC_PREVIEW=1, the app runs with NO backend: login is skipped and
// every screen is filled with the sample data below so the whole UI can be
// clicked through (e.g. on a Vercel preview deploy). Nothing is persisted.
// Remove the env var (or set it to 0) to use the real Supabase backend.
// -----------------------------------------------------------------------------

import type { Company, Customer, Profile, SparePart, Task } from "./types";

export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === "1";

export const previewProfile: Profile = {
  id: "u-head",
  full_name: "Ahmed Hassan",
  first_name: "Ahmed",
  role: "head",
  can_edit: true,
  created_at: new Date().toISOString(),
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

export const previewTasks: Task[] = [
  {
    id: "t-1",
    title: "Repair chair unit at Nile Dental",
    description: "Hydraulic lift not raising. Bring spare pump.",
    status: "in_progress",
    priority: "high",
    assignee_id: "u-head",
    customer_id: "cus-1",
    position: 1,
    due_date: daysFromNow(1),
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-head", full_name: "Ahmed Hassan", first_name: "Ahmed" },
  },
  {
    id: "t-2",
    title: "Install X-ray sensor — Bright Smile",
    description: "New Planmeca sensor calibration.",
    status: "todo",
    priority: "medium",
    assignee_id: "u-head",
    customer_id: "cus-2",
    position: 2,
    due_date: daysFromNow(3),
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-head", full_name: "Ahmed Hassan", first_name: "Ahmed" },
  },
  {
    id: "t-3",
    title: "Quarterly maintenance — Delta Medical",
    description: "Full preventive maintenance checklist.",
    status: "todo",
    priority: "low",
    assignee_id: "u-head",
    customer_id: "cus-3",
    position: 3,
    due_date: null,
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-head", full_name: "Ahmed Hassan", first_name: "Ahmed" },
  },
  {
    id: "t-4",
    title: "Replace foot pedal — Royal Dental",
    description: "",
    status: "done",
    priority: "medium",
    assignee_id: "u-eng-1",
    customer_id: "cus-4",
    position: 4,
    due_date: daysFromNow(-2),
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-eng-1", full_name: "Omar Khaled", first_name: "Omar" },
  },
  {
    id: "t-5",
    title: "Diagnose turbine noise — Delta",
    description: "Reported grinding noise on high-speed handpiece.",
    status: "in_progress",
    priority: "high",
    assignee_id: "u-eng-2",
    customer_id: "cus-3",
    position: 5,
    due_date: daysFromNow(2),
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-eng-2", full_name: "Sara Nabil", first_name: "Sara" },
  },
  {
    id: "t-6",
    title: "Firmware update — Sirona Intego",
    description: "",
    status: "todo",
    priority: "medium",
    assignee_id: "u-eng-1",
    customer_id: "cus-4",
    position: 6,
    due_date: daysFromNow(5),
    created_by: "u-head",
    created_at: "",
    assignee: { id: "u-eng-1", full_name: "Omar Khaled", first_name: "Omar" },
  },
];

// Build a mock task from create-form input so the board updates locally in
// preview mode without a backend.
export function makePreviewTask(input: {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee_id: string | null;
  customer_id: string | null;
  due_date: string | null;
}): Task {
  const eng = previewEngineers.find((e) => e.id === input.assignee_id) ?? null;
  return {
    id: `t-${Math.random().toString(36).slice(2, 9)}`,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    assignee_id: input.assignee_id,
    customer_id: input.customer_id,
    position: Date.now(),
    due_date: input.due_date,
    created_by: previewProfile.id,
    created_at: new Date().toISOString(),
    assignee: eng
      ? { id: eng.id, full_name: eng.full_name, first_name: eng.first_name }
      : null,
  };
}
