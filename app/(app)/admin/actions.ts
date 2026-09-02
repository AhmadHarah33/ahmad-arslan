"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { PREVIEW } from "@/lib/preview";

const ROLES: UserRole[] = ["head", "organizer", "engineer"];

// Create a new user account. Head-only (verified server-side). Uses the
// service-role admin client because auth user creation requires it.
export async function createUser(input: {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}) {
  const me = await getProfile();
  if (me?.role !== "head") return { error: "Not authorized" };

  if (!input.email.trim() || input.password.length < 6) {
    return { error: "Email and a password (6+ chars) are required" };
  }
  if (!ROLES.includes(input.role)) return { error: "Unknown role" };
  if (PREVIEW) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name.trim(), role: input.role },
  });
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

// Update a profile's role / edit-grant / name. Head-only; RLS also enforces.
export async function updateProfile(
  id: string,
  patch: { role?: UserRole; can_edit?: boolean; full_name?: string }
) {
  const me = await getProfile();
  if (me?.role !== "head") return { error: "Not authorized" };
  if (patch.role !== undefined && !ROLES.includes(patch.role)) {
    return { error: "Unknown role" };
  }
  if (PREVIEW) return { ok: true };

  const supabase = createClient();
  const update: Record<string, unknown> = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.can_edit !== undefined) update.can_edit = patch.can_edit;
  if (patch.full_name !== undefined) {
    update.full_name = patch.full_name.trim();
    update.first_name = patch.full_name.trim().split(" ")[0] ?? "";
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
