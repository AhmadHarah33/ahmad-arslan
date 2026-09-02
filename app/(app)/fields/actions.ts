"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FieldEntity, FieldOption, FieldType } from "@/lib/customFields";

function revalidateAll() {
  revalidatePath("/tasks");
  revalidatePath("/customers");
  revalidatePath("/spare-parts");
  revalidatePath("/");
}

// --- Schema management (add / rename / delete / reorder) — editors only. -----

export async function createField(input: {
  entity: FieldEntity;
  label: string;
  field_type: FieldType;
  options: FieldOption[];
}) {
  if (!input.label.trim()) return { error: "Field name is required" };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("field_definitions")
    .insert({
      entity: input.entity,
      label: input.label.trim(),
      field_type: input.field_type,
      options: input.options,
      position: Date.now(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true, field: data };
}

export async function updateField(
  id: string,
  patch: { label?: string; options?: FieldOption[] }
) {
  const supabase = createClient();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label.trim();
  if (patch.options !== undefined) update.options = patch.options;

  const { error } = await supabase
    .from("field_definitions")
    .update(update)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteField(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("field_definitions")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// --- Values --------------------------------------------------------------- -

export async function upsertFieldValue(
  fieldId: string,
  recordId: string,
  value: unknown
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("field_values")
    .upsert(
      { field_id: fieldId, record_id: recordId, value, updated_at: new Date().toISOString() },
      { onConflict: "field_id,record_id" }
    );
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}
