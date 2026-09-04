"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addTaskPart,
  removeTaskPart,
  setTaskPartQuantity,
} from "@/app/(app)/tasks/parts-actions";
import { useAction } from "@/lib/use-action";
import { useT } from "@/lib/i18n/provider";
import { toastErr } from "@/lib/toast";

type UsedRow = { id: string; spare_part_id: string; name: string; quantity: number };
type PartOption = { id: string; name: string };

// Records spare parts consumed on a task. Stock is not touched here: it comes
// off once the organizer approves the completed task (see set_task_completed).
//
// Choosing a part attaches it immediately. This used to be a three-step row —
// pick a part, set a quantity, then press a separate "Add" — and picking a
// part and then pressing the modal's Save attached nothing and said nothing,
// which is exactly how tasks reached Done with the parts still in the
// engineer's head. Quantity is edited on the attached row instead.
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

  // Reporting the count from an effect, not from inside the state updaters:
  // calling the parent's setState during another component's render is a
  // React warning, and updaters can run more than once.
  const notify = useRef(onCountChange);
  notify.current = onCountChange;
  useEffect(() => {
    notify.current?.(used.length);
  }, [used.length]);

  const { run: attachPart, pending: busy } = useAction(addTaskPart);
  const { run: detachPart } = useAction(removeTaskPart);
  const { run: saveQuantity } = useAction(setTaskPartQuantity);

  async function pick(sparePartId: string) {
    if (!sparePartId) return;
    const name = parts.find((p) => p.id === sparePartId)?.name ?? "Part";
    const res = await attachPart(taskId, sparePartId, 1);
    if (!res) return; // useAction already surfaced the failure
    setUsed((prev) => [
      ...prev,
      {
        id: (res as any)?.row?.id ?? `tmp-${Date.now()}`,
        spare_part_id: sparePartId,
        name,
        quantity: 1,
      },
    ]);
  }

  async function changeQuantity(id: string, next: number) {
    const clamped = Math.max(1, Math.round(next) || 1);
    setUsed((prev) => prev.map((r) => (r.id === id ? { ...r, quantity: clamped } : r)));
    const res = await saveQuantity(id, clamped);
    if (!res) toastErr(t("task.partQuantityFailed"));
  }

  async function remove(id: string) {
    const res = await detachPart(id);
    if (res) setUsed((prev) => prev.filter((r) => r.id !== id));
  }

  // A part already on the task is dropped from the picker rather than adding
  // a second row for the same part.
  const available = parts.filter((p) => !used.some((r) => r.spare_part_id === p.id));

  return (
    <div className="space-y-2">
      {used.length === 0 && (
        <p className="text-sm text-ink-faint">{t("task.noParts")}</p>
      )}

      {used.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
          {editable ? (
            <>
              <label className="sr-only" htmlFor={`qty-${r.id}`}>
                {t("parts.quantity")}
              </label>
              <input
                id={`qty-${r.id}`}
                type="number"
                min={1}
                className="input h-8 w-16 py-1 text-sm"
                value={r.quantity}
                onChange={(e) => changeQuantity(r.id, Number(e.target.value))}
              />
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 text-xs font-medium"
                style={{ color: "rgb(var(--tone-stuck-ink))" }}
              >
                {t("common.delete")}
              </button>
            </>
          ) : (
            <span className="text-sm text-ink-faint">× {r.quantity}</span>
          )}
        </div>
      ))}

      {editable && (
        <select
          className="input"
          value=""
          disabled={busy || available.length === 0}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">
            {available.length === 0 ? t("task.allPartsAdded") : t("task.addPart")}
          </option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
