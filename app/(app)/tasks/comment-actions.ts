"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addComment(taskId: string, body: string) {
  if (!body.trim()) return { error: "Empty comment" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: user.id, body: body.trim() })
    .select("*, author:author_id(full_name, first_name)")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true, comment: data };
}

export async function deleteComment(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}
