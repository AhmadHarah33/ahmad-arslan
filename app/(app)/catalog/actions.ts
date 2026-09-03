"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { isManager } from "@/lib/permissions";

// Adding is open to everyone: an engineer filling in a customer shouldn't be
// blocked mid-form waiting for a manager. Renaming and deleting are not —
// they change what every linked customer reads, so they stay with the head
// engineer and the organizer.
async function requireManager() {
  const profile = await requireProfile();
  if (!isManager(profile)) return "Only the organizer or head engineer can do that.";
  return null;
}

function refresh() {
  revalidatePath("/catalog");
  revalidatePath("/customers");
  revalidatePath("/spare-parts");
}

/* --- cities --- */

export async function createCity(name: string) {
  const supabase = createClient();
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };

  // Case-insensitive unique index: hand back the existing row rather than an
  // error, so typing a city that's already there just selects it.
  const { data: existing } = await supabase
    .from("cities")
    .select("id")
    .ilike("name", clean)
    .maybeSingle();
  if (existing) {
    refresh();
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from("cities")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) return { error: error.message };
  refresh();
  return { id: data.id };
}

export async function renameCity(id: string, name: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const supabase = createClient();
  const { error } = await supabase.from("cities").update({ name: clean }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteCity(id: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const supabase = createClient();
  const { error } = await supabase.from("cities").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

/* --- machine models --- */

export async function createModel(companyId: string, name: string) {
  const supabase = createClient();
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  if (!companyId) return { error: "Pick a brand first." };

  const { data: existing } = await supabase
    .from("machine_models")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", clean)
    .maybeSingle();
  if (existing) {
    refresh();
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from("machine_models")
    .insert({ company_id: companyId, name: clean })
    .select("id")
    .single();
  if (error) return { error: error.message };
  refresh();
  return { id: data.id };
}

export async function renameModel(id: string, name: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const supabase = createClient();
  const { error } = await supabase
    .from("machine_models")
    .update({ name: clean })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteModel(id: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const supabase = createClient();
  const { error } = await supabase.from("machine_models").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

/* --- brands (the existing companies table) --- */

export async function createBrand(name: string) {
  const supabase = createClient();
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const { data, error } = await supabase
    .from("companies")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) return { error: error.message };
  refresh();
  return { id: data.id };
}

export async function renameBrand(id: string, name: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const supabase = createClient();
  const { error } = await supabase.from("companies").update({ name: clean }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// Deleting a brand cascades to its models (machine_models.company_id is
// ON DELETE CASCADE) and unlinks its customers and spare parts, so this one
// is confirmed loudly in the UI before it gets here.
export async function deleteBrand(id: string) {
  const denied = await requireManager();
  if (denied) return { error: denied };
  const supabase = createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
