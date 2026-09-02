import type { Profile, UserRole } from "./types";

// UI-level permission helpers. These decide what controls to SHOW. The real
// enforcement lives in Postgres RLS — never trust these for security.

// Account management (creating users, changing roles/grants) is Head-only.
export function isHead(profile: Profile | null | undefined): boolean {
  return profile?.role === "head";
}

// Head and organizer reach everything except account management, so they never
// need the per-person `can_edit` grant.
export function isManager(profile: Profile | null | undefined): boolean {
  return profile?.role === "head" || profile?.role === "organizer";
}

// Can the user edit shared data (customers, companies, spare parts)?
export function canEditData(profile: Profile | null | undefined): boolean {
  return !!profile && (isManager(profile) || profile.can_edit);
}

// Can the user edit this specific task? Head and organizer edit all; engineers
// edit tasks they own (an assignee, or the creator).
export function canEditTask(
  profile: Profile | null | undefined,
  task: {
    created_by: string | null;
    assignees?: { id: string }[];
  }
): boolean {
  if (!profile) return false;
  if (isManager(profile)) return true;
  if (task.created_by === profile.id) return true;
  return !!task.assignees?.some((a) => a.id === profile.id);
}

const ROLE_LABELS: Record<UserRole, string> = {
  head: "Head of engineers",
  organizer: "Organizer",
  engineer: "Engineer",
};

export function roleLabel(role: UserRole | null | undefined): string {
  return role ? ROLE_LABELS[role] ?? "Engineer" : "Engineer";
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}
