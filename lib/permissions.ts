import type { Profile } from "./types";

// UI-level permission helpers. These decide what controls to SHOW. The real
// enforcement lives in Postgres RLS — never trust these for security.

export function isHead(profile: Profile | null | undefined): boolean {
  return profile?.role === "head";
}

// Can the user edit shared data (customers, companies, spare parts)?
export function canEditData(profile: Profile | null | undefined): boolean {
  return !!profile && (profile.role === "head" || profile.can_edit);
}

// Can the user edit this specific task? Head edits all; engineers edit tasks
// they own (an assignee, or the creator).
export function canEditTask(
  profile: Profile | null | undefined,
  task: {
    created_by: string | null;
    assignees?: { id: string }[];
  }
): boolean {
  if (!profile) return false;
  if (profile.role === "head") return true;
  if (task.created_by === profile.id) return true;
  return !!task.assignees?.some((a) => a.id === profile.id);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}
