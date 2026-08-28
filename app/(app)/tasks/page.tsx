import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import TasksBoard from "@/components/tasks/board";
import type { Customer, Profile } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewEngineers,
  previewFieldDefinitions,
  previewFieldValues,
  previewTasks,
} from "@/lib/preview";

export default async function TasksPage() {
  const profile = await requireProfile();

  if (PREVIEW) {
    return (
      <TasksBoard
        profile={profile}
        initialTasks={previewTasks}
        engineers={previewEngineers}
        customers={previewCustomers.map((c) => ({ id: c.id, name: c.name }))}
        fieldDefs={previewFieldDefinitions.task ?? []}
        fieldValues={previewFieldValues}
      />
    );
  }

  const supabase = createClient();

  const [{ data: tasks }, { data: engineers }, { data: customers }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .order("position", { ascending: true }),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);

  const taskList = normalizeTasks(tasks);
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
    />
  );
}
