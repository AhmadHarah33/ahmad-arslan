"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW } from "@/lib/preview";
import { newOptionId, TAG_COLOR_KEYS } from "@/lib/customFields";
import type { FieldOption } from "@/lib/customFields";

export async function importCustomers(
  rows: { name: string; city: string; model: string; sn: string; brand: string }[]
) {
  const valid = rows.filter((r) => r.name.trim());
  if (PREVIEW) return { ok: true, count: valid.length };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Insert customers.
  const { data: inserted, error } = await supabase
    .from("customers")
    .insert(
      valid.map((r) => ({
        name: r.name.trim(),
        location: r.city.trim(),
        machine: r.model.trim(),
        serial_number: r.sn.trim(),
        created_by: user?.id ?? null,
      }))
    )
    .select("id, name");
  if (error) return { error: error.message };

  // Map Brand values onto the Brand custom field, creating options as needed.
  const brandRows = valid.filter((r) => r.brand.trim());
  if (brandRows.length > 0 && inserted) {
    const { data: brandDef } = await supabase
      .from("field_definitions")
      .select("id, options")
      .eq("entity", "customer")
      .ilike("label", "brand")
      .limit(1)
      .maybeSingle();

    if (brandDef) {
      const options: FieldOption[] = (brandDef.options as FieldOption[]) ?? [];
      const byLabel = new Map(options.map((o) => [o.label.toLowerCase(), o]));
      const values: { field_id: string; record_id: string; value: string }[] = [];

      inserted.forEach((c, i) => {
        const brand = valid[i]?.brand.trim();
        if (!brand) return;
        let opt = byLabel.get(brand.toLowerCase());
        if (!opt) {
          opt = {
            id: newOptionId(),
            label: brand,
            color: TAG_COLOR_KEYS[options.length % TAG_COLOR_KEYS.length],
          };
          options.push(opt);
          byLabel.set(brand.toLowerCase(), opt);
        }
        values.push({ field_id: brandDef.id, record_id: c.id, value: opt.id });
      });

      await supabase.from("field_definitions").update({ options }).eq("id", brandDef.id);
      if (values.length)
        await supabase
          .from("field_values")
          .upsert(values, { onConflict: "field_id,record_id" });
    }
  }

  revalidatePath("/customers");
  return { ok: true, count: inserted?.length ?? 0 };
}

export async function importParts(
  rows: { company: string; name: string; part_number: string; quantity: string }[]
) {
  const valid = rows.filter((r) => r.name.trim());
  if (PREVIEW) return { ok: true, count: valid.length };
  const supabase = createClient();

  // Resolve / create companies.
  const { data: companies } = await supabase.from("companies").select("id, name");
  const byName = new Map((companies ?? []).map((c) => [c.name.toLowerCase(), c.id]));

  const missing = [
    ...new Set(
      valid
        .map((r) => r.company.trim())
        .filter((n) => n && !byName.has(n.toLowerCase()))
    ),
  ];
  if (missing.length) {
    const { data: created } = await supabase
      .from("companies")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    for (const c of created ?? []) byName.set(c.name.toLowerCase(), c.id);
  }

  const toInsert = valid
    .map((r) => {
      const companyId = byName.get(r.company.trim().toLowerCase());
      if (!companyId) return null;
      return {
        company_id: companyId,
        name: r.name.trim(),
        part_number: r.part_number.trim(),
        quantity: parseInt(r.quantity, 10) || 0,
      };
    })
    .filter(Boolean) as any[];

  if (toInsert.length) {
    const { error } = await supabase.from("spare_parts").insert(toInsert);
    if (error) return { error: error.message };
  }
  revalidatePath("/spare-parts");
  return { ok: true, count: toInsert.length };
}
