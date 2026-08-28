"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW } from "@/lib/preview";

export async function addTaskPart(
  taskId: string,
  sparePartId: string,
  quantity: number
) {
  if (PREVIEW) return { ok: true };
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

export async function removeTaskPart(id: string) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase.from("task_parts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/spare-parts");
  return { ok: true };
}
