"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { addComment, deleteComment } from "@/app/(app)/tasks/comment-actions";
import type { Profile } from "@/lib/types";
import { isManager } from "@/lib/permissions";
import { useAction } from "@/lib/use-action";
import { useT } from "@/lib/i18n/provider";

type Comment = {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
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
  const t = useT();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");

  const { run: postComment, pending: busy } = useAction(addComment, {
    onSuccess: (res) => {
      const c: any = (res as any)?.comment;
      if (!c) return;
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
    },
  });

  const { run: removeComment } = useAction(deleteComment);

  useEffect(() => {
    let active = true;
    async function load() {
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

  function submit() {
    if (!body.trim()) return;
    postComment(taskId, body);
  }

  async function remove(id: string) {
    const res = await removeComment(id);
    // undefined means the action failed; useAction has already toasted it.
    if (res) setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-sm text-ink-faint">{t("task.noComments")}</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar id={c.author_id || c.id} name={c.author_name} size={26} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-faint">
              <span className="font-medium text-ink">{c.author_name}</span> ·{" "}
              {timeAgo(c.created_at)}
              {(c.author_id === profile.id || isManager(profile)) && (
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
          placeholder={t("task.commentPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary shrink-0" onClick={submit} disabled={busy}>
          {busy ? "…" : t("task.post")}
        </button>
      </div>
    </div>
  );
}
