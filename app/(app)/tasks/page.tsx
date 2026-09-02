import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import TasksBoard from "@/components/tasks/board";
import type { Customer, Profile } from "@/lib/types";

export default async function TasksPage() {
  const profile = await requireProfile();


  const supabase = createClient();

  const [{ data: tasks }, { data: engineers }, { data: customers }, { data: comments }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .order("position", { ascending: true }),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("task_comments").select("task_id"),
    ]);

  const taskList = normalizeTasks(tasks);

  // Per-task comment count for the board cards.
  const commentCounts: Record<string, number> = {};
  for (const row of (comments ?? []) as { task_id: string }[]) {
    commentCounts[row.task_id] = (commentCounts[row.task_id] ?? 0) + 1;
  }

  const { defs, valueMap } = await loadFields(
    "task",
    taskList.map((t) => t.id)
  );

  return (
    <TasksBoard
      profile={profile}
      initialTasks={taskList}
      engineers={(engineers ?? []) as Profile[]}
      customers={(customers ?? []) as Pick<Customer, "id" | "name">[]}
      fieldDefs={defs}
      fieldValues={valueMap}
      commentCounts={commentCounts}
    />
  );
}
