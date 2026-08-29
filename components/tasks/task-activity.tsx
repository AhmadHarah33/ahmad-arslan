"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW } from "@/lib/preview";
import { Avatar } from "@/components/avatar";
import { addComment, deleteComment } from "@/app/(app)/tasks/comment-actions";
import type { Profile } from "@/lib/types";
import { toastErr } from "@/lib/toast";

type Comment = {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

const previewComments: Record<string, Comment[]> = {
  "t-1": [
    {
      id: "pc1",
      author_id: "u-eng-1",
      author_name: "Omar Khaled",
      body: "Ordered the spare pump, arriving tomorrow.",
      created_at: new Date(Date.now() - 3600_000).toISOString(),
    },
  ],
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function TaskActivity({
  taskId,
  profile,
}: {
  taskId: string;
  profile: Profile;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (PREVIEW) {
        setComments(previewComments[taskId] ?? []);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("task_comments")
        .select("id, author_id, body, created_at, author:author_id(full_name, first_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setComments(
        (data ?? []).map((c: any) => ({
          id: c.id,
          author_id: c.author_id,
          author_name: c.author?.full_name || c.author?.first_name || "Someone",
          body: c.body,
          created_at: c.created_at,
        }))
      );
    }
    load();
    return () => {
      active = false;
    };
  }, [taskId]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await addComment(taskId, body);
    setBusy(false);
    if (res?.error) return toastErr(res.error);
    if (res?.comment) {
      const c: any = res.comment;
      setComments((prev) => [
        ...prev,
        {
          id: c.id,
          author_id: c.author_id,
          author_name:
            c.author_name || c.author?.full_name || profile.full_name || "You",
          body: c.body,
          created_at: c.created_at,
        },
      ]);
      setBody("");
    }
  }

  async function remove(id: string) {
    const res = await deleteComment(id);
    if (res?.error) return toastErr(res.error);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-sm text-ink-faint">No comments yet.</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar id={c.author_id || c.id} name={c.author_name} size={26} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-faint">
              <span className="font-medium text-ink">{c.author_name}</span> ·{" "}
              {timeAgo(c.created_at)}
              {(c.author_id === profile.id || profile.role === "head") && (
                <button
                  onClick={() => remove(c.id)}
                  className="ml-2 text-red-500 hover:underline"
                >
                  delete
                </button>
              )}
            </p>
            <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary shrink-0" onClick={submit} disabled={busy}>
          {busy ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
