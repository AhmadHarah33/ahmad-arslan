"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { PREVIEW, makePreviewTask } from "@/lib/preview";

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createTask(input: {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  customer_id: string | null;
  due_date: string | null;
}) {
  if (PREVIEW) return { ok: true, task: makePreviewTask(input) };

  const supabase = createClient();
  const uid = await currentUserId();
  if (!uid) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority,
      assignee_id: input.assignee_id,
      customer_id: input.customer_id,
      due_date: input.due_date,
      position: Date.now(),
      created_by: uid,
    })
    .select("*, assignee:assignee_id(id, full_name, first_name)")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, task: data };
}

export async function updateTask(
  id: string,
  input: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignee_id: string | null;
    customer_id: string | null;
    due_date: string | null;
  }
) {
  if (PREVIEW) return { ok: true, task: { ...makePreviewTask(input), id } };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority,
      assignee_id: input.assignee_id,
      customer_id: input.customer_id,
      due_date: input.due_date,
    })
    .eq("id", id)
    .select("*, assignee:assignee_id(id, full_name, first_name)")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, task: data };
}

// Move a card to a new status/position (used by drag-and-drop).
export async function moveTask(id: string, status: TaskStatus, position: number) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, position })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(id: string) {
  if (PREVIEW) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}
