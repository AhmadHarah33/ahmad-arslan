import type { UserRole } from "@/lib/types";
import type { StringKey } from "./dictionary";

// Role -> translation key. Replaces ROLE_LABELS/roleLabel for anything the
// user sees; the raw enum values stay untouched in the database.
export function roleKey(role: UserRole | null | undefined): StringKey {
  if (role === "head") return "role.head";
  if (role === "organizer") return "role.organizer";
  return "role.engineer";
}
