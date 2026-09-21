import type { Task } from "./types";

// Select string that pulls each task's assignees via the join table.
export const TASK_SELECT =
  "*, task_assignees(is_lead, profile:profile_id(id, full_name, first_name))";

// Flatten the nested join rows into a clean `assignees` array on the task,
// leads sorted first.
export function normalizeTask(row: any): Task {
  const assignees = (row?.task_assignees ?? [])
    .filter((r: any) => r.profile)
    .map((r: any) => ({ ...r.profile, is_lead: !!r.is_lead }))
    .sort((a: any, b: any) => Number(b.is_lead) - Number(a.is_lead));
  const { task_assignees, ...rest } = row ?? {};
  return { ...rest, assignees } as Task;
}

export function normalizeTasks(rows: any[] | null | undefined): Task[] {
  return (rows ?? []).map(normalizeTask);
}
