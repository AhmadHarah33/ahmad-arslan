"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnImagePath, joinName } from "@/lib/profile-image";
import { supabaseServerUrl } from "@/lib/supabase/internal-url";
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

// ---------------------------------------------------------------------------
// Own profile: name, picture, e-mail, password
// ---------------------------------------------------------------------------

async function me() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// The password is checked with a throwaway client so the visitor's own session
// cookies are never touched by the check.
async function passwordIsRight(email: string, password: string) {
  const probe = createAuthClient(supabaseServerUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

function refresh() {
  revalidatePath("/", "layout");
}

// First name + surname. Stored as full_name ("First Last") plus first_name, the
// same shape the Team page writes.
export async function saveProfileName(input: { first: string; last: string }) {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in" };
  const { full_name, first_name } = joinName(input.first, input.last);
  if (!first_name) return { error: "A first name is required" };
  if (input.first.trim().length > 60 || input.last.trim().length > 60) {
    return { error: "Names are limited to 60 characters" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, first_name })
    .eq("id", user.id);
  if (error) return { error: error.message };
  await supabase.auth.updateUser({ data: { full_name } });
  refresh();
  return { ok: true };
}

// Record (or clear, with null) the picture in the user's profile. The file has
// already been uploaded from the browser into the user's own folder.
export async function saveProfileImage(kind: "avatar" | "cover", path: string | null) {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in" };
  if (kind !== "avatar" && kind !== "cover") return { error: "Invalid file" };
  if (path !== null && !isOwnImagePath(user.id, kind, path)) return { error: "Invalid file" };

  const column = kind === "avatar" ? "avatar_path" : "cover_path";
  const { data: before } = await supabase.from("profiles").select(column).eq("id", user.id).single();
  const { error } = await supabase
    .from("profiles")
    .update({ [column]: path })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Best effort: drop the file that was replaced so the bucket doesn't fill up.
  const old = (before as Record<string, string | null> | null)?.[column];
  if (old && old !== path && old.startsWith(`${user.id}/`)) {
    await supabase.storage.from("profile-images").remove([old]);
  }
  refresh();
  return { ok: true };
}

// Changing the e-mail needs the current password. It takes effect at once (this
// is a closed team app: there is no mailbox confirmation step).
export async function changeOwnEmail(input: { email: string; currentPassword: string }) {
  const { user } = await me();
  if (!user || !user.email) return { error: "Not signed in" };
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid e-mail" };
  if (email === user.email.toLowerCase()) return { error: "That is already your e-mail" };
  if (!input.currentPassword) return { error: "Enter your current password" };
  if (!(await passwordIsRight(user.email, input.currentPassword))) {
    return { error: "Your current password is wrong" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

export async function changeOwnPassword(input: { currentPassword: string; newPassword: string }) {
  const { user } = await me();
  if (!user || !user.email) return { error: "Not signed in" };
  if (input.newPassword.length < 6) return { error: "Password must be 6+ characters" };
  if (!input.currentPassword) return { error: "Enter your current password" };
  if (!(await passwordIsRight(user.email, input.currentPassword))) {
    return { error: "Your current password is wrong" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: input.newPassword });
  if (error) return { error: error.message };
  return { ok: true };
}
