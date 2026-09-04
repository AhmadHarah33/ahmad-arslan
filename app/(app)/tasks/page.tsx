import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import TasksBoard from "@/components/tasks/board";
import type { City, Company, Customer, MachineModel, Profile } from "@/lib/types";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: { new?: string };
}) {
  const profile = await requireProfile();


  const supabase = createClient();

  const [
    { data: tasks },
    { data: engineers },
    { data: customers },
    { data: companies },
    { data: cities },
    { data: models },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .order("position", { ascending: true }),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("companies").select("*").order("name"),
    supabase.from("cities").select("*").order("name"),
    supabase.from("machine_models").select("*").order("name"),
  ]);

  const taskList = normalizeTasks(tasks);

  // The comment thread went away with the Activity section; the board's list
  // view still takes the shape, so hand it an empty map rather than querying
  // a table nothing writes to any more.
  const commentCounts: Record<string, number> = {};

  const { defs, valueMap } = await loadFields(
    "task",
    taskList.map((t) => t.id)
  );

  return (
    <TasksBoard
      openNewOnMount={searchParams?.new === "1"}
      profile={profile}
      initialTasks={taskList}
      engineers={(engineers ?? []) as Profile[]}
      customers={(customers ?? []) as Pick<Customer, "id" | "name">[]}
      companies={(companies ?? []) as Company[]}
      cities={(cities ?? []) as City[]}
      models={(models ?? []) as MachineModel[]}
      fieldDefs={defs}
      fieldValues={valueMap}
      commentCounts={commentCounts}
    />
  );
}
