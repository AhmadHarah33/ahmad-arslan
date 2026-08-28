import type { Task } from "./types";

// Select string that pulls each task's assignees via the join table.
export const TASK_SELECT =
  "*, task_assignees(profile:profile_id(id, full_name, first_name))";

// Flatten the nested join rows into a clean `assignees` array on the task.
export function normalizeTask(row: any): Task {
  const assignees = (row?.task_assignees ?? [])
    .map((r: any) => r.profile)
    .filter(Boolean);
  const { task_assignees, ...rest } = row ?? {};
  return { ...rest, assignees } as Task;
}

export function normalizeTasks(rows: any[] | null | undefined): Task[] {
  return (rows ?? []).map(normalizeTask);
}
