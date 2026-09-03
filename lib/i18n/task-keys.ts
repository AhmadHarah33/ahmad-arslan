import type { TaskPriority, TaskStatus } from "@/lib/types";
import type { StringKey } from "./dictionary";

export function statusKey(s: TaskStatus): StringKey {
  return `status.${s}` as StringKey;
}

export function priorityKey(p: TaskPriority): StringKey {
  return `priority.${p}` as StringKey;
}
