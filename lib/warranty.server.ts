import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./agreements";
import { customerWarranty, factoryWarranty, type CustomerWarranty } from "./warranty";
import type { Agreement } from "./types";

type Ext = Pick<Agreement, "includes_warranty" | "warranty_end" | "status">;

export type WarrantyData = {
  today: string;
  // Per machine: factory end (computed from the catalog, else the typed date).
  machines: Map<string, { end: string | null; auto: boolean }>;
  // Per customer.
  customers: Map<string, CustomerWarranty>;
};

// The customer's installation date is a custom field (customer / date /
// "Installation Date"). Matched by name rather than id so a re-created
// database or a re-ordered field list still finds it.
async function loadInstallDates(supabase: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: defs } = await supabase
    .from("field_definitions")
    .select("id, label")
    .eq("entity", "customer")
    .eq("field_type", "date");
  const def = (defs ?? []).find((d) => /install/i.test(d.label as string));
  if (!def) return out;

  const { data: vals } = await supabase
    .from("field_values")
    .select("record_id, value")
    .eq("field_id", def.id);
  for (const v of vals ?? []) {
    const value = (v as { value: unknown }).value;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      out.set((v as { record_id: string }).record_id, value.slice(0, 10));
    }
  }
  return out;
}

// One pass over customers, machines, catalog months, install dates and live
// agreement extensions -> everything that needs to know who is in warranty.
export async function loadWarrantyData(supabase: SupabaseClient): Promise<WarrantyData> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: machines }, { data: models }, { data: links }, installs] = await Promise.all([
    supabase
      .from("customer_machines")
      .select("id, customer_id, model_id, warranty_end")
      .eq("is_approved", true),
    supabase.from("machine_models").select("id, warranty_months"),
    supabase
      .from("agreement_machines")
      .select("machine_id, agreement:agreement_id(status, includes_warranty, warranty_end)"),
    loadInstallDates(supabase),
  ]);

  const monthsOf = new Map(
    (models ?? []).map((m) => [m.id as string, (m.warranty_months as number | null) ?? null])
  );

  const exts = new Map<string, Ext[]>();
  for (const l of (links ?? []) as unknown as {
    machine_id: string;
    agreement: Ext | Ext[] | null;
  }[]) {
    const a = Array.isArray(l.agreement) ? l.agreement[0] : l.agreement;
    if (a) exts.set(l.machine_id, [...(exts.get(l.machine_id) ?? []), a]);
  }

  const machineOut: WarrantyData["machines"] = new Map();
  const byCustomer = new Map<
    string,
    { months: number | null; manualEnd: string | null; extensions: Ext[] }[]
  >();
  for (const m of (machines ?? []) as {
    id: string;
    customer_id: string;
    model_id: string | null;
    warranty_end: string | null;
  }[]) {
    const months = m.model_id ? monthsOf.get(m.model_id) ?? null : null;
    machineOut.set(
      m.id,
      factoryWarranty(installs.get(m.customer_id) ?? null, months, m.warranty_end)
    );
    const list = byCustomer.get(m.customer_id) ?? [];
    list.push({ months, manualEnd: m.warranty_end, extensions: exts.get(m.id) ?? [] });
    byCustomer.set(m.customer_id, list);
  }

  const customers = new Map<string, CustomerWarranty>();
  for (const [id, list] of byCustomer) {
    customers.set(id, customerWarranty(today, installs.get(id) ?? null, list));
  }
  // Customers with an install date but no machine yet still show it.
  for (const [id, date] of installs) {
    if (!customers.has(id)) customers.set(id, customerWarranty(today, date, []));
  }

  return { today, machines: machineOut, customers };
}

// Customers whose warranty ends within the next 30 days (soonest first), for
// the banner on the Customers page.
export function expiringFrom(data: WarrantyData): { customer_id: string; date: string }[] {
  const horizon = addDays(data.today, 30);
  return [...data.customers.entries()]
    .filter(([, w]) => w.end && w.end >= data.today && w.end <= horizon)
    .map(([customer_id, w]) => ({ customer_id, date: w.end! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
