"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditData } from "@/lib/permissions";
import { cleanLink } from "@/lib/shared-links";

// The Shared drives card. Only people who may edit shared data can change it
// (checked here and again by the table's RLS policy).

async function guard() {
  const profile = await getProfile();
  if (!canEditData(profile)) return { error: "You are not allowed to change shared links" } as const;
  return { ok: true } as const;
}

export async function addSharedLink(input: { title: string; url: string; note: string; icon: string }) {
  const g = await guard();
  if ("error" in g) return g;
  const clean = cleanLink(input);
  if ("error" in clean) return clean;

  const supabase = createClient();
  const { data: last } = await supabase
    .from("shared_links")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("shared_links")
    .insert({ ...clean.value, position: (last?.position ?? 0) + 1 })
    .select("id, title, note, url, icon, position")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true, link: data };
}

export async function deleteSharedLink(id: string) {
  const g = await guard();
  if ("error" in g) return g;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Invalid link" };
  const supabase = createClient();
  const { error } = await supabase.from("shared_links").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

