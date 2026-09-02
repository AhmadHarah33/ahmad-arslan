"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SPARE_PHOTOS_BUCKET } from "@/lib/storage";

export async function saveCompany(id: string | null, name: string) {
  if (!name.trim()) return { error: "Company name is required" };
  const supabase = createClient();

  if (id) {
    const { error } = await supabase
      .from("companies")
      .update({ name: name.trim() })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("companies")
      .insert({ name: name.trim() });
    if (error) return { error: error.message };
  }
  revalidatePath("/spare-parts");
  return { ok: true };
}

export async function saveSparePart(
  id: string | null,
  input: {
    company_id: string;
    name: string;
    part_number: string;
    quantity: number;
    min_quantity: number;
    notes: string;
  }
) {
  if (!input.name.trim()) return { error: "Part name is required" };
  const supabase = createClient();

  if (id) {
    const { error } = await supabase
      .from("spare_parts")
      .update({
        name: input.name.trim(),
        part_number: input.part_number.trim(),
        quantity: input.quantity,
        min_quantity: input.min_quantity,
        notes: input.notes.trim(),
      })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/spare-parts");
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("spare_parts")
    .insert({
      company_id: input.company_id,
      name: input.name.trim(),
      part_number: input.part_number.trim(),
      quantity: input.quantity,
      min_quantity: input.min_quantity,
      notes: input.notes.trim(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/spare-parts");
  return { ok: true, id: data.id as string };
}

export async function deleteSparePart(id: string) {
  const supabase = createClient();
  // Remove stored photos first, then the row (cascade drops photo rows).
  const { data: photos } = await supabase
    .from("spare_part_photos")
    .select("storage_path")
    .eq("spare_part_id", id);
  if (photos && photos.length > 0) {
    await supabase.storage
      .from(SPARE_PHOTOS_BUCKET)
      .remove(photos.map((p) => p.storage_path));
  }
  const { error } = await supabase.from("spare_parts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/spare-parts");
  return { ok: true };
}

// Record a photo row after the client has uploaded the file to Storage.
export async function addPhotoRecord(sparePartId: string, storagePath: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("spare_part_photos")
    .insert({ spare_part_id: sparePartId, storage_path: storagePath });
  if (error) return { error: error.message };
  revalidatePath("/spare-parts");
  return { ok: true };
}

export async function deletePhoto(photoId: string, storagePath: string) {
  const supabase = createClient();
  await supabase.storage.from(SPARE_PHOTOS_BUCKET).remove([storagePath]);
  const { error } = await supabase
    .from("spare_part_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { error: error.message };
  revalidatePath("/spare-parts");
  return { ok: true };
}
