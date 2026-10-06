import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, effectiveWarrantyEnd } from "./agreements";
import {
  warrantyEvents,
  type CoveredMachine,
  type DashAgreement,
  type DashVisit,
  type WarrantyEvent,
} from "./agreements.dashboard";
import type { AgreementOverview } from "./types";

// Creates the board task for every agreement visit due within the next 7 days
// (generate_due_agreement_visits). Idempotent, so it's safe to call on every
// page load. Best-effort: a failure here must never stop the page rendering,
// but it is logged because a silently dead generator means visits never appear.
export async function generateDueAgreementVisits(supabase: SupabaseClient) {
  try {
    const { error } = await supabase.rpc("generate_due_agreement_visits");
    if (error) console.error("generate_due_agreement_visits failed:", error.message);
  } catch (e) {
    console.error("generate_due_agreement_visits threw:", e);
  }
}

// Everything the agreement form needs to pick from: customers, their machines
// (with a readable label), and the technicians.
export async function loadAgreementFormData(supabase: SupabaseClient) {
  const [{ data: customers }, { data: machines }, { data: people }] = await Promise.all([
    supabase.from("customers").select("id, name, contact_person").order("name"),
    supabase
      .from("customer_machines")
      .select(
        "id, customer_id, serial_number, warranty_end, company:company_id(name), model:model_id(name), city:city_id(name)"
      )
      .eq("is_approved", true)
      .order("created_at"),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);

  type Joined = { name: string } | { name: string }[] | null;
  const nameOf = (j: Joined) => (Array.isArray(j) ? j[0]?.name : j?.name) ?? "";

  return {
    customers: (customers ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      contact_person: (c.contact_person as string) ?? "",
    })),
    machines: (machines ?? []).map((m) => {
      const parts = [nameOf(m.company as Joined), nameOf(m.model as Joined)]
        .filter(Boolean)
        .join(" ");
      const city = nameOf(m.city as Joined);
      return {
        id: m.id as string,
        customer_id: m.customer_id as string,
        label: [parts || "—", city].filter(Boolean).join(" · "),
        serial_number: (m.serial_number as string) ?? "",
        warranty_end: (m.warranty_end as string | null) ?? null,
      };
    }),
    technicians: (people ?? []).map((p) => ({
      id: p.id as string,
      name: (p.full_name as string) || "—",
    })),
  };
}

type Joined = { name: string } | { name: string }[] | null;
const nameOf = (j: Joined) => (Array.isArray(j) ? j[0]?.name : j?.name) ?? "";

// Everything the dashboard and the customers-with-agreement page show: every
// non-cancelled agreement with its machines, cities and technicians, the
// visits in a window around today, and the derived warranty-end events.
export async function loadAgreementsDashboardData(supabase: SupabaseClient): Promise<{
  today: string;
  agreements: DashAgreement[];
  visits: DashVisit[];
  warranties: WarrantyEvent[];
}> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: ags }, { data: vis }, { data: cov }, { data: techs }] = await Promise.all([
    supabase
      .from("agreement_overview")
      .select("*")
      .neq("status", "cancelled")
      .order("customer_name"),
    // A generous window around today; the calendar pages through it client-side.
    supabase
      .from("agreement_visits")
      .select("id, agreement_id, due_date, done_at")
      .gte("due_date", addDays(today, -120))
      .lte("due_date", addDays(today, 550)),
    supabase
      .from("agreement_machines")
      .select(
        "agreement_id, machine:machine_id(id, customer_id, warranty_end, company:company_id(name), model:model_id(name), city:city_id(name))"
      ),
    supabase
      .from("agreement_assignees")
      .select("agreement_id, profile:profile_id(full_name)"),
  ]);

  const overview = (ags ?? []) as AgreementOverview[];
  const byId = new Map(overview.map((a) => [a.id, a]));

  type MachineRow = {
    id: string;
    customer_id: string;
    warranty_end: string | null;
    company: Joined;
    model: Joined;
    city: Joined;
  };
  const labels = new Map<string, string[]>();
  const cities = new Map<string, string[]>();
  const covered: CoveredMachine[] = [];
  for (const row of (cov ?? []) as unknown as {
    agreement_id: string;
    machine: MachineRow | MachineRow[] | null;
  }[]) {
    const m = Array.isArray(row.machine) ? row.machine[0] : row.machine;
    const a = byId.get(row.agreement_id);
    if (!m || !a) continue;
    const label = [nameOf(m.company), nameOf(m.model)].filter(Boolean).join(" ") || "—";
    labels.set(row.agreement_id, [...(labels.get(row.agreement_id) ?? []), label]);
    const city = nameOf(m.city);
    if (city) {
      cities.set(row.agreement_id, [...new Set([...(cities.get(row.agreement_id) ?? []), city])]);
    }
    covered.push({
      agreement_id: row.agreement_id,
      machine_id: m.id,
      customer_id: m.customer_id,
      customer_name: a.customer_name,
      factory_end: m.warranty_end,
    });
  }

  const people = new Map<string, string[]>();
  for (const row of (techs ?? []) as unknown as {
    agreement_id: string;
    profile: { full_name: string } | { full_name: string }[] | null;
  }[]) {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (p?.full_name) {
      people.set(row.agreement_id, [...(people.get(row.agreement_id) ?? []), p.full_name]);
    }
  }

  const agreements: DashAgreement[] = overview.map((a) => ({
    ...a,
    // numeric(12,2) can arrive as a string depending on the driver path.
    amount: a.amount != null ? Number(a.amount) : null,
    machine_labels: labels.get(a.id) ?? [],
    cities: cities.get(a.id) ?? [],
    technician_names: people.get(a.id) ?? [],
  }));

  return {
    today,
    agreements,
    visits: (vis ?? []) as DashVisit[],
    warranties: warrantyEvents(covered, agreements),
  };
}

// Customers with a machine whose warranty ends within the next 30 days, for
// the banner on the Customers page. A machine's warranty is the later of its
// own factory date and the extension of any live agreement covering it.
export async function loadExpiringWarranties(
  supabase: SupabaseClient
): Promise<{ customer_id: string; date: string }[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 30);

  const [{ data: machines }, { data: links }] = await Promise.all([
    supabase
      .from("customer_machines")
      .select("id, customer_id, warranty_end")
      .eq("is_approved", true),
    supabase
      .from("agreement_machines")
      .select("machine_id, agreement:agreement_id(status, includes_warranty, warranty_end)"),
  ]);

  type Ext = {
    status: "active" | "ended" | "cancelled" | "draft";
    includes_warranty: boolean;
    warranty_end: string | null;
  };
  const exts = new Map<string, Ext[]>();
  for (const l of (links ?? []) as unknown as {
    machine_id: string;
    agreement: Ext | Ext[] | null;
  }[]) {
    const a = Array.isArray(l.agreement) ? l.agreement[0] : l.agreement;
    if (a) exts.set(l.machine_id, [...(exts.get(l.machine_id) ?? []), a]);
  }

  const soonest = new Map<string, string>();
  for (const m of (machines ?? []) as {
    id: string;
    customer_id: string;
    warranty_end: string | null;
  }[]) {
    const end = effectiveWarrantyEnd(m, exts.get(m.id) ?? []);
    if (!end || end < today || end > horizon) continue;
    const prev = soonest.get(m.customer_id);
    if (!prev || end < prev) soonest.set(m.customer_id, end);
  }
  return [...soonest.entries()]
    .map(([customer_id, date]) => ({ customer_id, date }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
