import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadFields } from "@/lib/fields.server";
import { generateDueAgreementVisits } from "@/lib/agreements.server";
import { TASK_SELECT, normalizeTasks } from "@/lib/tasks.server";
import TasksBoard from "@/components/tasks/board";
import type { City, Company, Customer, CustomerMachine, MachineModel, Profile } from "@/lib/types";

const DONE_WINDOW_DAYS = 60;

export default async function TasksPage({
  searchParams: searchPromise,
}: {
  searchParams?: Promise<{ new?: string; all?: string }>;
}) {
  const searchParams = await searchPromise;
  const profile = await requireProfile();


  const supabase = await createClient();
  // Visit tasks are created lazily; make sure due ones exist before listing.
  await generateDueAgreementVisits(supabase);

  // Done tasks pile up forever; shipping every one to the browser on each visit
  // gets slower as history grows. Show open work plus recently finished tasks,
  // and let ?all=1 load the full archive.
  const showAll = searchParams?.all === "1";
  const cutoff = new Date(Date.now() - DONE_WINDOW_DAYS * 86400000).toISOString();

  const [
    { data: tasks },
    { count: olderDone },
    { data: engineers },
    { data: customers },
    { data: companies },
    { data: cities },
    { data: models },
    { data: customerMachines },
  ] = await Promise.all([
    (showAll
      ? supabase.from("tasks").select(TASK_SELECT)
      : supabase
          .from("tasks")
          .select(TASK_SELECT)
          .or(`status.neq.done,completed_at.gte.${cutoff},completed_at.is.null`)
    ).order("position", { ascending: true }),
    showAll
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "done")
          .lt("completed_at", cutoff),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("companies").select("*").order("name"),
    supabase.from("cities").select("*").order("name"),
    supabase.from("machine_models").select("*").order("name"),
    // Used to autofill a task's city/brand/model once a customer is picked:
    // one machine autofills outright, several offer a pick.
    supabase
      .from("customer_machines")
      .select("id, customer_id, city_id, company_id, model_id, serial_number")
      .order("created_at", { ascending: true }),
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
      customerMachines={(customerMachines ?? []) as Pick<CustomerMachine, "id" | "customer_id" | "city_id" | "company_id" | "model_id" | "serial_number">[]}
      fieldDefs={defs}
      fieldValues={valueMap}
      commentCounts={commentCounts}
      olderDoneHidden={olderDone ?? 0}
      doneWindowDays={DONE_WINDOW_DAYS}
    />
  );
}
