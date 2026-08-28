"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW } from "@/lib/preview";

type LinkInput = { label: string; url: string };
type CustomerInput = {
  name: string;
  location: string;
  machine: string;
  serial_number: string;
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
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const uid = await currentUserId();

  let customerId = id;

  if (id) {
    const { error } = await supabase
      .from("customers")
      .update({
        name: input.name.trim(),
        location: input.location.trim(),
        machine: input.machine.trim(),
        serial_number: input.serial_number.trim(),
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: input.name.trim(),
        location: input.location.trim(),
        machine: input.machine.trim(),
        serial_number: input.serial_number.trim(),
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
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath("/");
  return { ok: true };
}
