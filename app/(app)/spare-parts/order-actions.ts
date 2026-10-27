"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { isManager } from "@/lib/permissions";

// The database policies already restrict order lists to head/organizer; the
// check here just turns that into a readable message instead of an RLS error.
async function requireManager() {
  const profile = await getProfile();
  return isManager(profile);
}

export async function saveOrderList(input: {
  company_id: string;
  supplier: string;
  notes: string;
  lines: { spare_part_id: string; quantity: number }[];
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  if (!(await requireManager())) return { error: "Only managers can create order lists." };
  const lines = input.lines.filter((l) => Number.isInteger(l.quantity) && l.quantity > 0);
  if (lines.length === 0) return { error: "Pick at least one part with a quantity." };

  const supabase = createClient();
  const [{ data: parts, error: partsErr }, { data: company }] = await Promise.all([
    supabase
      .from("spare_parts")
      .select("id, company_id, name, part_number, spare_part_photos(storage_path, created_at)")
      .in(
        "id",
        lines.map((l) => l.spare_part_id)
      ),
    supabase.from("companies").select("id, name").eq("id", input.company_id).single(),
  ]);
  if (partsErr) return { error: partsErr.message };
  if (!company) return { error: "Brand not found." };

  // One list is one brand: refuse a mixed selection even if the UI let it by.
  const byId = new Map((parts ?? []).map((p) => [p.id as string, p]));
  if (byId.size !== new Set(lines.map((l) => l.spare_part_id)).size) {
    return { error: "Some of the selected parts no longer exist." };
  }
  if ([...byId.values()].some((p) => p.company_id !== input.company_id)) {
    return { error: "An order list can only hold parts from one brand." };
  }

  const { data: order, error } = await supabase
    .from("order_lists")
    .insert({
      company_id: company.id,
      company_name: company.name,
      supplier: input.supplier.trim(),
      notes: input.notes.trim(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: itemsErr } = await supabase.from("order_list_items").insert(
    lines.map((l, i) => {
      const p = byId.get(l.spare_part_id)!;
      const photos = ((p.spare_part_photos ?? []) as { storage_path: string; created_at: string }[])
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return {
        order_list_id: order.id,
        spare_part_id: p.id,
        position: i,
        part_number: p.part_number,
        name: p.name,
        quantity: l.quantity,
        photo_path: photos[0]?.storage_path ?? null,
      };
    })
  );
  if (itemsErr) {
    // Don't leave an empty, numbered list behind.
    await supabase.from("order_lists").delete().eq("id", order.id);
    return { error: itemsErr.message };
  }

  revalidatePath("/spare-parts");
  return { ok: true, id: order.id as string };
}

export type OrderListRow = {
  id: string;
  number: number;
  company_name: string;
  supplier: string;
  created_at: string;
  lines: number;
  pieces: number;
};

export async function listOrderLists(): Promise<{ rows: OrderListRow[]; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_lists")
    .select("id, number, company_name, supplier, created_at, order_list_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { rows: [], error: error.message };
  return {
    rows: (data ?? []).map((o) => {
      const items = (o.order_list_items ?? []) as { quantity: number }[];
      return {
        id: o.id,
        number: Number(o.number),
        company_name: o.company_name,
        supplier: o.supplier,
        created_at: o.created_at,
        lines: items.length,
        pieces: items.reduce((s, i) => s + i.quantity, 0),
      };
    }),
  };
}

export async function deleteOrderList(id: string) {
  if (!(await requireManager())) return { error: "Only managers can delete order lists." };
  const supabase = createClient();
  const { error } = await supabase.from("order_lists").delete().eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}
