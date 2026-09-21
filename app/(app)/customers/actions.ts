"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type LinkInput = { label: string; url: string };
type CustomerInput = {
  name: string;
  // City/brand/model/serial live on customer_machines now (a customer can
  // have several); saveCustomerMachine below writes those, and
  // sync_customer_primary_machine mirrors the primary one back onto this
  // row, so this input never touches those columns directly.
  contact_person: string;
  contact_info: string;
  status: "active" | "inactive";
  links: LinkInput[];
};

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function cleanLinks(links: LinkInput[]) {
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({ label: l.label.trim() || "Link", url: l.url.trim() }));
}

export async function saveCustomer(id: string | null, input: CustomerInput) {
  const supabase = createClient();
  const uid = await currentUserId();

  let customerId = id;

  if (id) {
    const { error } = await supabase
      .from("customers")
      .update({
        name: input.name.trim(),
        contact_person: input.contact_person.trim(),
        contact_info: input.contact_info.trim(),
        status: input.status,
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: input.name.trim(),
        contact_person: input.contact_person.trim(),
        contact_info: input.contact_info.trim(),
        status: input.status,
        created_by: uid,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    customerId = data.id;
  }

  // Replace links.
  await supabase.from("customer_links").delete().eq("customer_id", customerId);
  const links = cleanLinks(input.links);
  if (links.length > 0) {
    const { error } = await supabase
      .from("customer_links")
      .insert(links.map((l) => ({ ...l, customer_id: customerId })));
    if (error) return { error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath("/");
  return { ok: true };
}

// Name-only quick add, for the customer picker on the task modal — the same
// "+ new" pattern as city/model (see ComboSelect), so filling in a task
// doesn't need a trip to the Customers page first. Everything else about the
// customer (machines, contact info) gets filled in later by opening it there.
export async function createCustomer(name: string) {
  const supabase = createClient();
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: clean, created_by: uid })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { id: data.id };
}

export async function deleteCustomer(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/");
  return { ok: true };
}

type MachineInput = {
  city_id: string | null;
  company_id: string | null;
  model_id: string | null;
  serial_number: string;
};

// A customer can have several machines; each edit goes through the same
// pending-approval gate as the rest of a customer's data (see
// gate_customer_machine_upsert / gate_customer_machine_delete).
export async function saveCustomerMachine(
  customerId: string,
  id: string | null,
  input: MachineInput
) {
  const supabase = createClient();
  if (id) {
    const { error } = await supabase
      .from("customer_machines")
      .update({
        city_id: input.city_id,
        company_id: input.company_id,
        model_id: input.model_id,
        serial_number: input.serial_number.trim(),
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const uid = await currentUserId();
    const { error } = await supabase.from("customer_machines").insert({
      customer_id: customerId,
      city_id: input.city_id,
      company_id: input.company_id,
      model_id: input.model_id,
      serial_number: input.serial_number.trim(),
      created_by: uid,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/customers");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCustomerMachine(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("customer_machines").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function approveCustomerMachine(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("approve_customer_machine", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true };
}

export async function rejectCustomerMachine(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("reject_customer_machine", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true };
}

// Approve/reject a pending customer change. RLS-independent — the RPCs
// themselves check the caller is head/organizer and raise otherwise; see
// gate_customer_upsert / gate_customer_delete / approve_customer /
// reject_customer in supabase/migrations.
export async function approveCustomer(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("approve_customer", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true };
}

export async function rejectCustomer(id: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("reject_customer", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true };
}
