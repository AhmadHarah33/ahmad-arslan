"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PREVIEW, previewSpareParts } from "@/lib/preview";
import { addTaskPart, removeTaskPart } from "@/app/(app)/tasks/parts-actions";
import { toastErr } from "@/lib/toast";

type UsedRow = { id: string; spare_part_id: string; name: string; quantity: number };
type PartOption = { id: string; name: string };

// Records spare parts consumed on a task; inventory adjusts via DB trigger.
export default function TaskParts({
  taskId,
  editable,
}: {
  taskId: string;
  editable: boolean;
}) {
  const [used, setUsed] = useState<UsedRow[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (PREVIEW) {
        setParts(previewSpareParts.map((p) => ({ id: p.id, name: p.name })));
        setUsed([]);
        return;
      }
      const supabase = createClient();
      const [{ data: tp }, { data: sp }] = await Promise.all([
        supabase
          .from("task_parts")
          .select("id, spare_part_id, quantity, part:spare_part_id(name)")
          .eq("task_id", taskId),
        supabase.from("spare_parts").select("id, name").order("name"),
      ]);
      if (!active) return;
      setUsed(
        (tp ?? []).map((r: any) => ({
          id: r.id,
          spare_part_id: r.spare_part_id,
          name: r.part?.name ?? "Part",
          quantity: r.quantity,
        }))
      );
      setParts((sp ?? []) as PartOption[]);
    }
    load();
    return () => {
      active = false;
    };
  }, [taskId]);

  async function add() {
    if (!partId) return;
    setBusy(true);
    const res = await addTaskPart(taskId, partId, Number(qty) || 1);
    setBusy(false);
    if (res?.error) return toastErr(res.error);
    const name = parts.find((p) => p.id === partId)?.name ?? "Part";
    setUsed((prev) => [
      ...prev,
      { id: (res as any)?.row?.id ?? `tmp-${Date.now()}`, spare_part_id: partId, name, quantity: Number(qty) || 1 },
    ]);
    setPartId("");
    setQty(1);
  }

  async function remove(id: string) {
    const res = await removeTaskPart(id);
    if (res?.error) return toastErr(res.error);
    setUsed((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-2">
      {used.length === 0 && (
        <p className="text-sm text-ink-faint">No parts recorded.</p>
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
            <option value="">Add a part…</option>
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
