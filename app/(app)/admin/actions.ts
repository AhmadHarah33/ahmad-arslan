"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

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

// Change a member's name, e-mail and (optionally) password. Head-only; the
// auth side needs the service-role client. An empty password keeps the old one.
export async function updateUser(
  id: string,
  input: { full_name: string; email: string; password?: string }
) {
  const me = await getProfile();
  if (me?.role !== "head") return { error: "Not authorized" };

  const full_name = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password ?? "";
  if (!full_name) return { error: "A name is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid e-mail" };
  if (password && password.length < 6) return { error: "Password must be 6+ characters" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    email,
    email_confirm: true,
    user_metadata: { full_name },
    ...(password ? { password } : {}),
  });
  if (error) return { error: error.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name, first_name: full_name.split(" ")[0] ?? "" })
    .eq("id", id);
  if (profileError) return { error: profileError.message };

  revalidatePath("/admin");
  return { ok: true };
}

// Remove an account. Head-only, and never your own. Tasks and history stay:
// every reference to the user is either cleared or (task assignments) dropped.
export async function deleteUser(id: string) {
  const me = await getProfile();
  if (me?.role !== "head") return { error: "Not authorized" };
  if (me.id === id) return { error: "You cannot delete your own account" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true };
}
