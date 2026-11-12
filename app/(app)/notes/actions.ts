"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { isHead } from "@/lib/permissions";
import { cleanTags, type NoteMention } from "@/lib/notes";

// Notes are head-only. The database policy is the real lock; this check turns
// a refusal into a readable message instead of an RLS error.
async function requireHead() {
  return isHead(await getProfile());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_BODY = 50000;

function cleanMentions(raw: unknown, body: string): NoteMention[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NoteMention[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const { kind, id, label } = m as NoteMention;
    if ((kind !== "user" && kind !== "task") || typeof id !== "string" || !UUID.test(id)) continue;
    if (typeof label !== "string" || !label) continue;
    // Only keep a mention whose text is still in the note.
    if (!body.includes((kind === "user" ? "@" : "#") + label)) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id, label });
  }
  return out;
}

export interface NoteInput {
  title: string;
  body: string;
  mentions: NoteMention[];
  tags: string[];
}

function validate(input: NoteInput) {
  const title = String(input.title ?? "").slice(0, MAX_TITLE);
  const body = String(input.body ?? "");
  if (body.length > MAX_BODY) return { error: "This note is too long." } as const;
  const tags = cleanTags(input.tags ?? []);
  return {
    row: {
      title,
      body,
      mentions: cleanMentions(input.mentions, body),
      tags,
    },
  } as const;
}

export async function createNote(
  input: NoteInput
): Promise<{ ok?: boolean; id?: string; updated_at?: string; error?: string }> {
  if (!(await requireHead())) return { error: "Only the head of the engineers can use notes." };
  const v = validate(input);
  if ("error" in v) return { error: v.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("notes")
    .insert(v.row)
    .select("id, updated_at")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the note." };
  return { ok: true, id: data.id as string, updated_at: data.updated_at as string };
}

export async function updateNote(
  id: string,
  input: NoteInput
): Promise<{ ok?: boolean; updated_at?: string; error?: string }> {
  if (!(await requireHead())) return { error: "Only the head of the engineers can use notes." };
  if (!UUID.test(id)) return { error: "Note not found." };
  const v = validate(input);
  if ("error" in v) return { error: v.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("notes")
    .update({ ...v.row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("updated_at")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Note not found." };
  return { ok: true, updated_at: data.updated_at as string };
}

export async function setNotePinned(id: string, pinned: boolean) {
  if (!(await requireHead())) return { error: "Only the head of the engineers can use notes." };
  if (!UUID.test(id)) return { error: "Note not found." };
  const { error } = await createClient().from("notes").update({ pinned }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

// "Delete" is an archive first: the note can be restored from the archive view.
export async function setNoteArchived(id: string, archived: boolean) {
  if (!(await requireHead())) return { error: "Only the head of the engineers can use notes." };
  if (!UUID.test(id)) return { error: "Note not found." };
  const { error } = await createClient()
    .from("notes")
    .update({ archived_at: archived ? new Date().toISOString() : null, ...(archived ? { pinned: false } : {}) })
    .eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

// Permanent removal — only offered for notes already in the archive.
export async function purgeNote(id: string) {
  if (!(await requireHead())) return { error: "Only the head of the engineers can use notes." };
  if (!UUID.test(id)) return { error: "Note not found." };
  const { error } = await createClient()
    .from("notes")
    .delete()
    .eq("id", id)
    .not("archived_at", "is", null);
  return error ? { error: error.message } : { ok: true };
}
