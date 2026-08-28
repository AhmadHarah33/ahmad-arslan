import { createClient } from "./supabase/server";
import type { FieldDefinition, FieldEntity } from "./customFields";

export interface LoadedFields {
  defs: FieldDefinition[];
  // record_id -> { field_id -> value }
  valueMap: Record<string, Record<string, unknown>>;
}

// Load an entity's field definitions and the values for a set of records, so
// cards/rows can render key custom fields as chips.
export async function loadFields(
  entity: FieldEntity,
  recordIds: string[]
): Promise<LoadedFields> {
  const supabase = createClient();
  const { data: defs } = await supabase
    .from("field_definitions")
    .select("*")
    .eq("entity", entity)
    .order("position", { ascending: true });

  const valueMap: Record<string, Record<string, unknown>> = {};
  if (recordIds.length > 0) {
    const { data: vals } = await supabase
      .from("field_values")
      .select("field_id, record_id, value")
      .in("record_id", recordIds);
    for (const v of vals ?? []) {
      const row = v as { field_id: string; record_id: string; value: unknown };
      (valueMap[row.record_id] ||= {})[row.field_id] = row.value;
    }
  }

  return { defs: (defs ?? []) as FieldDefinition[], valueMap };
}
