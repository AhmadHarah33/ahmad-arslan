"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/spare-parts");
}

export async function addTaskPart(
  taskId: string,
  sparePartId: string,
  quantity: number,
  unitPrice: number | null
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("task_parts")
    .insert({ task_id: taskId, spare_part_id: sparePartId, quantity, unit_price: unitPrice })
    .select("*, part:spare_part_id(name)")
    .single();
  if (error) return { error: error.message };
  refresh();
  return { ok: true, row: data };
}

// Attaches several parts to a task in one call — used right after creating a
// task that already had parts added to it in the modal before the first
// save, when there's no task id yet for them to attach to one at a time.
export async function addTaskPartsBulk(
  taskId: string,
  rows: { spare_part_id: string; quantity: number; unit_price: number | null }[]
) {
  if (rows.length === 0) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase
    .from("task_parts")
    .insert(rows.map((r) => ({ task_id: taskId, ...r })));
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// Quantity is edited on the attached row now that selecting a part attaches
// it immediately, so it needs its own write.
export async function setTaskPartQuantity(id: string, quantity: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("task_parts")
    .update({ quantity: Math.max(1, Math.round(quantity) || 1) })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// Price is editable per line — the catalog price is only the starting
// suggestion when a part is picked (see TaskParts).
export async function setTaskPartPrice(id: string, unitPrice: number | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("task_parts")
    .update({ unit_price: unitPrice })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function removeTaskPart(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("task_parts").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
