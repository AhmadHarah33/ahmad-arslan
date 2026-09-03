"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addTaskPart, removeTaskPart } from "@/app/(app)/tasks/parts-actions";
import { useAction } from "@/lib/use-action";
import { useT } from "@/lib/i18n/provider";

type UsedRow = { id: string; spare_part_id: string; name: string; quantity: number };
type PartOption = { id: string; name: string };

// Records spare parts consumed on a task; inventory adjusts via DB trigger.
export default function TaskParts({
  taskId,
  editable,
  onCountChange,
}: {
  taskId: string;
  editable: boolean;
  // Lets the task modal show the "sent for approval" notice as soon as a
  // part is attached, without re-fetching task_parts itself.
  onCountChange?: (count: number) => void;
}) {
  const [used, setUsed] = useState<UsedRow[]>([]);
  const t = useT();
  const [parts, setParts] = useState<PartOption[]>([]);
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const [{ data: tp }, { data: sp }] = await Promise.all([
        supabase
          .from("task_parts")
          .select("id, spare_part_id, quantity, part:spare_part_id(name)")
          .eq("task_id", taskId),
        supabase.from("spare_parts").select("id, name").order("name"),
      ]);
      if (!active) return;
      const rows = (tp ?? []).map((r: any) => ({
        id: r.id,
        spare_part_id: r.spare_part_id,
        name: r.part?.name ?? "Part",
        quantity: r.quantity,
      }));
      setUsed(rows);
      onCountChange?.(rows.length);
      setParts((sp ?? []) as PartOption[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [taskId]);

  const { run: attachPart, pending: busy } = useAction(addTaskPart, {
    onSuccess: (res) => {
      const name = parts.find((p) => p.id === partId)?.name ?? "Part";
      setUsed((prev) => {
        const next = [
          ...prev,
          {
            id: (res as any)?.row?.id ?? `tmp-${Date.now()}`,
            spare_part_id: partId,
            name,
            quantity: Number(qty) || 1,
          },
        ];
        onCountChange?.(next.length);
        return next;
      });
      setPartId("");
      setQty(1);
    },
  });
  const { run: detachPart } = useAction(removeTaskPart);

  function add() {
    if (!partId) return;
    attachPart(taskId, partId, Number(qty) || 1);
  }

  async function remove(id: string) {
    const res = await detachPart(id);
    if (res)
      setUsed((prev) => {
        const next = prev.filter((r) => r.id !== id);
        onCountChange?.(next.length);
        return next;
      });
  }

  return (
    <div className="space-y-2">
      {used.length === 0 && (
        <p className="text-sm text-ink-faint">{t("task.noParts")}</p>
      )}
      {used.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between rounded-lg bg-surface-soft px-3 py-1.5"
        >
          <span className="text-sm text-ink">
            {r.name} <span className="text-ink-faint">× {r.quantity}</span>
          </span>
          {editable && (
            <button onClick={() => remove(r.id)} className="text-xs text-red-500">
              remove
            </button>
          )}
        </div>
      ))}

      {editable && (
        <div className="flex gap-2">
          <select
            className="input"
            value={partId}
            onChange={(e) => setPartId(e.target.value)}
          >
            <option value="">{t("task.addPart")}</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="input w-20"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <button className="btn-ghost shrink-0" onClick={add} disabled={busy || !partId}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
