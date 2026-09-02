"use server";

import { createClient } from "@/lib/supabase/server";
import type { ThemeMode } from "@/lib/theme";
import type { BackgroundStyle } from "@/lib/types";

// Persist the current user's theme choice to their profile.
export async function saveTheme(accent: string, mode: ThemeMode) {
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

// Persist the global background setting (owner/head only — RLS on
// app_settings also enforces this).
export async function saveBackground(style: BackgroundStyle, blur: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ bg_style: style, bg_blur: blur })
    .eq("id", 1);
  if (error) return { error: error.message };
  return { ok: true };
}
