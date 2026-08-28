"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW } from "@/lib/preview";

export async function saveSchedule(
  id: string | null,
  input: {
    customer_id: string;
    title: string;
    interval_months: number;
    next_due: string;
    active: boolean;
  }
) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  if (id) {
    const { error } = await supabase
      .from("maintenance_schedules")
      .update({
        title: input.title.trim(),
        interval_months: input.interval_months,
        next_due: input.next_due,
        active: input.active,
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("maintenance_schedules").insert({
      customer_id: input.customer_id,
      title: input.title.trim(),
      interval_months: input.interval_months,
      next_due: input.next_due,
      active: input.active,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteSchedule(id: string) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase
    .from("maintenance_schedules")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return { ok: true };
}
