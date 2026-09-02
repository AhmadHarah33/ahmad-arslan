"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { TASK_SELECT, normalizeTask } from "@/lib/tasks.server";

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function revalidate() {
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createTask(input: {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_ids: string[];
  customer_id: string | null;
  due_date: string | null;
}) {

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
      customer_id: input.customer_id,
      due_date: input.due_date,
      position: Date.now(),
      created_by: uid,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (input.assignee_ids.length > 0) {
    const { error: aErr } = await supabase.from("task_assignees").insert(
      input.assignee_ids.map((profile_id) => ({ task_id: data.id, profile_id }))
    );
    if (aErr) return { error: aErr.message };
  }

  const { data: full } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", data.id)
    .single();

  revalidate();
  return { ok: true, task: full ? normalizeTask(full) : undefined };
}

export async function updateTask(
  id: string,
  input: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    customer_id: string | null;
    due_date: string | null;
  }
) {

  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      priority: input.priority,
      customer_id: input.customer_id,
      due_date: input.due_date,
    })
    .eq("id", id)
    .select(TASK_SELECT)
    .single();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, task: normalizeTask(data) };
}

// Assignment (RLS enforces: head assigns anyone; engineers self-claim unassigned).
export async function addAssignee(taskId: string, profileId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("task_assignees")
    .insert({ task_id: taskId, profile_id: profileId });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function removeAssignee(taskId: string, profileId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("profile_id", profileId);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// Move a card to a new status/position (used by drag-and-drop).
export async function moveTask(id: string, status: TaskStatus, position: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, position })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteTask(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
