"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type LinkInput = { label: string; url: string };
type CustomerInput = {
  name: string;
  // The `location` / `machine` text columns are written by the
  // a_customers_sync_catalog trigger from these two, so the form only ever
  // sends the link and there is one source of truth.
  city_id: string | null;
  model_id: string | null;
  serial_number: string;
  company_id: string | null;
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
        city_id: input.city_id,
        model_id: input.model_id,
        serial_number: input.serial_number.trim(),
        company_id: input.company_id,
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
        city_id: input.city_id,
        model_id: input.model_id,
        serial_number: input.serial_number.trim(),
        company_id: input.company_id,
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

export async function deleteCustomer(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/");
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
