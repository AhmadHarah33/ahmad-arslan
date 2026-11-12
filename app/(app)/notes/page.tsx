import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isHead } from "@/lib/permissions";
import NotesView from "@/components/notes/notes-view";
import type { Note } from "@/lib/notes";
import type { AssigneeLite } from "@/lib/types";

// Head-only. RLS on `notes` is the real lock; this just keeps everyone else
// from landing on an empty screen.
export default async function NotesPage() {
  const profile = await requireProfile();
  if (!isHead(profile)) redirect("/");

  const supabase = createClient();
  const [{ data: notes }, { data: people }, { data: tasks }] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, body, mentions, tags, pinned, archived_at, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, first_name").order("full_name"),
    supabase
      .from("tasks")
      .select("id, title")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  return (
    <NotesView
      initialNotes={(notes ?? []) as Note[]}
      users={(people ?? []) as AssigneeLite[]}
      tasks={(tasks ?? []) as { id: string; title: string }[]}
    />
  );
}
