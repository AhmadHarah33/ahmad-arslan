import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TasksBoard from "@/components/tasks/board";
import type { Customer, Profile, Task } from "@/lib/types";
import {
  PREVIEW,
  previewCustomers,
  previewEngineers,
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
      />
    );
  }

  const supabase = createClient();

  const [{ data: tasks }, { data: engineers }, { data: customers }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*, assignee:assignee_id(id, full_name, first_name)")
        .order("position", { ascending: true }),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);

  return (
    <TasksBoard
      profile={profile}
      initialTasks={(tasks ?? []) as Task[]}
      engineers={(engineers ?? []) as Profile[]}
      customers={(customers ?? []) as Pick<Customer, "id" | "name">[]}
    />
  );
}
