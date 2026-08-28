"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW, previewTasks } from "@/lib/preview";
import { StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/dates";

type HistoryRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  created_at: string;
};

// Read-only list of this customer's tasks (open + past) — the machine's
// service history.
export default function ServiceHistory({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (PREVIEW) {
        const r = previewTasks
          .filter((t) => t.customer_id === customerId)
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due_date: t.due_date,
            created_at: t.created_at,
          }));
        if (active) setRows(r);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, due_date, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (active) setRows((data ?? []) as HistoryRow[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [customerId]);

  if (rows === null)
    return <p className="text-sm text-ink-faint">Loading history…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-ink-faint">No tasks for this customer yet.</p>;

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-2"
        >
          <StatusChip status={r.status} />
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {r.title}
          </span>
          {r.due_date && (
            <span className="shrink-0 text-xs text-ink-faint">
              {formatDate(r.due_date)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
