"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskCurrency, TaskPriority, TaskStatus } from "@/lib/types";
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

type TaskFields = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  customer_id: string | null;
  due_date: string | null;
  city_id: string | null;
  company_id: string | null;
  model_id: string | null;
  parts_cost: number | null;
  service_charge: number | null;
  parts_currency: TaskCurrency;
  service_currency: TaskCurrency;
};

export async function createTask(
  input: TaskFields & {
    assignee_ids: string[];
    lead_assignee_id?: string | null;
    // Parts added in the modal before the task existed — attached here in
    // one go instead of one at a time, since there was no task_id for them
    // to attach to yet.
    parts?: { spare_part_id: string; quantity: number; unit_price: number | null }[];
  }
) {

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
      city_id: input.city_id,
      company_id: input.company_id,
      model_id: input.model_id,
      parts_cost: input.parts_cost,
      service_charge: input.service_charge,
      parts_currency: input.parts_currency,
      service_currency: input.service_currency,
      position: Date.now(),
      created_by: uid,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (input.assignee_ids.length > 0) {
    const { error: aErr } = await supabase.from("task_assignees").insert(
      input.assignee_ids.map((profile_id) => ({
        task_id: data.id,
        profile_id,
        is_lead: profile_id === input.lead_assignee_id,
      }))
    );
    if (aErr) return { error: aErr.message };
  }

  if (input.parts && input.parts.length > 0) {
    const { error: pErr } = await supabase
      .from("task_parts")
      .insert(input.parts.map((p) => ({ task_id: data.id, ...p })));
    if (pErr) return { error: pErr.message };
  }

  const { data: full } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", data.id)
    .single();

  revalidate();
  return { ok: true, task: full ? normalizeTask(full) : undefined };
}

export async function updateTask(id: string, input: TaskFields) {

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
      city_id: input.city_id,
      company_id: input.company_id,
      model_id: input.model_id,
      parts_cost: input.parts_cost,
      service_charge: input.service_charge,
      parts_currency: input.parts_currency,
      service_currency: input.service_currency,
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

// Marks one assignee as lead/responsible for the task. Setting it true is
// enough — the task_assignees_single_lead trigger clears the flag on every
// other row for the same task. Setting it false just un-marks that one.
export async function setLeadAssignee(taskId: string, profileId: string, lead: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("task_assignees")
    .update({ is_lead: lead })
    .eq("task_id", taskId)
    .eq("profile_id", profileId);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// Move a card to a new status/position (used by drag-and-drop, and by the
// Approve/Send-back buttons on a pending-approval card).
//
// Returns the resulting row rather than just { ok: true }: a task with spare
// parts attached that gets set to 'done' is silently redirected server-side
// to 'pending_approval' by the set_task_completed trigger, and the caller's
// optimistic client state needs to be corrected to match what actually
// landed, not what was requested.
export async function moveTask(id: string, status: TaskStatus, position: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, position })
    .eq("id", id)
    .select(TASK_SELECT)
    .single();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, task: normalizeTask(data) };
}

export async function deleteTask(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
