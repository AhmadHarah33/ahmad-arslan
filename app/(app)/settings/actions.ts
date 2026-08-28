"use server";

import { createClient } from "@/lib/supabase/server";
import { PREVIEW } from "@/lib/preview";
import type { ThemeMode } from "@/lib/theme";

// Persist the current user's theme choice to their profile.
export async function saveTheme(accent: string, mode: ThemeMode) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ theme_accent: accent, theme_mode: mode })
    .eq("id", user.id);
  if (error) return { error: error.message };
  return { ok: true };
}
