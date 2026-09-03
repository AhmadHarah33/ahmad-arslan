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

// Can the user edit this task? Every signed-in user can edit and reassign
// every task — kept as a function (rather than inlining `!!profile` at each
// call site) so the "everyone" policy has one place to change, and because
// it still reads naturally at each call site ("can this profile edit this
// task"). The one exception — approving a completed task that consumed
// spare parts — is enforced in the database trigger, not here; see
// set_task_completed in supabase/migrations.
export function canEditTask(
  profile: Profile | null | undefined,
  _task: {
    created_by: string | null;
    assignees?: { id: string }[];
  }
): boolean {
  return !!profile;
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
