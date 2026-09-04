"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addTaskPart(
  taskId: string,
  sparePartId: string,
  quantity: number
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("task_parts")
    .insert({ task_id: taskId, spare_part_id: sparePartId, quantity })
    .select("*, part:spare_part_id(name)")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/spare-parts");
  return { ok: true, row: data };
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
  revalidatePath("/tasks");
  revalidatePath("/spare-parts");
  return { ok: true };
}

export async function removeTaskPart(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("task_parts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/spare-parts");
  return { ok: true };
}
